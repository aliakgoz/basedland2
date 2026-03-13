import { TILE_SIZE } from "../shared/protocol";
import type { PlayerEntity } from "./entity";

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] | object }): Promise<T>;
}

interface TreasureConfig {
  enabled: boolean;
  reason?: string;
  chainId: number;
  usdcToken: string;
  recipient: string;
  amountUnits: string;
  amountDisplay: string;
}

interface PreparedDig {
  digId: string;
  tileX: number;
  tileY: number;
  payment: TreasureConfig;
}

interface DigResult {
  success: boolean;
  message: string;
  found?: boolean;
}

const BASE_CHAIN_HEX = "0x2105";
const BASE_CHAIN_DECIMAL = 8453;
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function padHex(value: string, length: number): string {
  return value.padStart(length, "0");
}

function encodeErc20Transfer(recipient: string, amountUnits: bigint): string {
  const addressWord = padHex(strip0x(recipient).toLowerCase(), 64);
  const amountWord = padHex(amountUnits.toString(16), 64);
  return `${ERC20_TRANSFER_SELECTOR}${addressWord}${amountWord}`;
}

async function pollReceipt(provider: EthereumProvider, txHash: string, timeoutMs = 120000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const receipt = await provider.request<{ status?: string } | null>({
      method: "eth_getTransactionReceipt",
      params: [txHash]
    });
    if (receipt) {
      return receipt.status === "0x1";
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  return false;
}

export class TreasureClient {
  private provider: EthereumProvider | null = null;
  private account: string | null = null;
  private busy = false;

  constructor(
    private readonly getPlayer: () => PlayerEntity | null,
    private readonly setMessage: (message: string) => void,
    private readonly setWalletState: (label: string, connected: boolean, busy: boolean) => void
  ) {
    this.refreshWalletState().catch(() => undefined);
  }

  async connectWallet(): Promise<void> {
    const provider = window.ethereum;
    if (!provider) {
      this.setMessage("Base wallet needed. Install Coinbase Wallet or MetaMask.");
      return;
    }
    this.provider = provider;
    this.setWalletState("Connecting...", false, true);

    try {
      const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
      this.account = accounts[0] ?? null;
      await this.ensureBaseNetwork();
      this.setWalletState(this.account ? `${this.account.slice(0, 6)}...${this.account.slice(-4)}` : "Wallet", Boolean(this.account), false);
      if (this.account) {
        this.setMessage("Wallet connected.");
      }
    } catch (error) {
      this.setWalletState("Wallet", false, false);
      this.setMessage("Wallet connection cancelled.");
    }
  }

  disconnectWallet(): void {
    this.account = null;
    this.provider = window.ethereum ?? null;
    this.setWalletState(window.ethereum ? "Connect Wallet" : "No Wallet", false, false);
    this.setMessage("Wallet disconnected from the game.");
  }

  async digAtPlayerTile(): Promise<void> {
    if (this.busy) {
      return;
    }

    const player = this.getPlayer();
    if (!player) {
      return;
    }

    this.busy = true;
    this.setWalletState(this.account ? `${this.account.slice(0, 6)}...${this.account.slice(-4)}` : "Wallet", Boolean(this.account), true);

    try {
      const config = await this.fetchConfig();
      if (!config.enabled) {
        this.setMessage(config.reason ?? "Treasure digging is disabled.");
        return;
      }

      if (!window.ethereum) {
        this.setMessage("A Base-compatible wallet is required for paid digs.");
        return;
      }

      if (!this.account) {
        await this.connectWallet();
      }
      if (!this.account || !this.provider) {
        return;
      }

      await this.ensureBaseNetwork();

      const tileX = Math.floor(player.x / TILE_SIZE);
      const tileY = Math.floor(player.y / TILE_SIZE);
      const prepared = await this.postJson<PreparedDig>("/api/treasure/prepare", {
        playerId: player.id,
        tileX,
        tileY
      });

      this.setMessage(`Approve ${prepared.payment.amountDisplay} USDC dig payment...`);
      const txHash = await this.provider.request<string>({
        method: "eth_sendTransaction",
        params: [
          {
            from: this.account,
            to: prepared.payment.usdcToken,
            data: encodeErc20Transfer(prepared.payment.recipient, BigInt(prepared.payment.amountUnits))
          }
        ]
      });

      this.setMessage("Waiting for Base transaction confirmation...");
      const mined = await pollReceipt(this.provider, txHash);
      if (!mined) {
        this.setMessage("Transaction not confirmed in time.");
        return;
      }

      const result = await this.postJson<DigResult>("/api/treasure/confirm", {
        playerId: player.id,
        digId: prepared.digId,
        txHash,
        payer: this.account
      });
      this.setMessage(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dig payment failed.";
      this.setMessage(message);
    } finally {
      this.busy = false;
      this.setWalletState(this.account ? `${this.account.slice(0, 6)}...${this.account.slice(-4)}` : "Wallet", Boolean(this.account), false);
    }
  }

  private async fetchConfig(): Promise<TreasureConfig> {
    return this.postJson<TreasureConfig>("/api/treasure/config", null, "GET");
  }

  private async refreshWalletState(): Promise<void> {
    if (!window.ethereum) {
      this.setWalletState("No Wallet", false, false);
      return;
    }
    this.provider = window.ethereum;
    const accounts = await this.provider.request<string[]>({ method: "eth_accounts" });
    this.account = accounts[0] ?? null;
    this.setWalletState(this.account ? `${this.account.slice(0, 6)}...${this.account.slice(-4)}` : "Connect Wallet", Boolean(this.account), false);
  }

  private async ensureBaseNetwork(): Promise<void> {
    if (!this.provider) {
      throw new Error("Wallet provider missing.");
    }
    const currentChain = await this.provider.request<string>({ method: "eth_chainId" });
    if (currentChain === BASE_CHAIN_HEX) {
      return;
    }

    try {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_CHAIN_HEX }]
      });
    } catch {
      await this.provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_CHAIN_HEX,
            chainName: "Base",
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18
            },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"]
          }
        ]
      });
    }

    const chainAfter = await this.provider.request<string>({ method: "eth_chainId" });
    if (chainAfter !== BASE_CHAIN_HEX && chainAfter !== `0x${BASE_CHAIN_DECIMAL.toString(16)}`) {
      throw new Error("Switch to Base mainnet to dig.");
    }
  }

  private async postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: body === null ? undefined : { "Content-Type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body)
    });

    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error((payload as { error?: string }).error ?? "Request failed.");
    }
    return payload;
  }
}
