import { Contract, JsonRpcProvider, Wallet } from "ethers";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)"
];

export interface TreasurePayoutStatus {
  enabled: boolean;
  signerAddress: string | null;
  reason?: string;
}

export interface TreasurePayoutResult {
  txHash: string;
}

export class TreasurePayoutService {
  private readonly provider: JsonRpcProvider | null;
  private readonly wallet: Wallet | null;
  private readonly token: Contract | null;

  constructor(
    private readonly rpcUrl: string,
    private readonly tokenAddress: string,
    private readonly privateKey: string
  ) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
      this.provider = null;
      this.wallet = null;
      this.token = null;
      return;
    }

    this.provider = new JsonRpcProvider(rpcUrl, 8453);
    this.wallet = new Wallet(privateKey, this.provider);
    this.token = new Contract(tokenAddress, ERC20_ABI, this.wallet);
  }

  getStatus(): TreasurePayoutStatus {
    if (!this.wallet || !this.token) {
      return {
        enabled: false,
        signerAddress: null,
        reason: "TREASURE_PAYOUT_PRIVATE_KEY missing on server."
      };
    }
    return {
      enabled: true,
      signerAddress: this.wallet.address
    };
  }

  async payoutUsdc(recipient: string, amountUnits: bigint): Promise<TreasurePayoutResult> {
    if (!this.wallet || !this.token) {
      throw new Error("Automatic payout is not configured on this server.");
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      throw new Error("Invalid payout recipient wallet address.");
    }
    if (amountUnits <= 0n) {
      throw new Error("Payout amount must be greater than zero.");
    }

    const tx = await this.token.transfer(recipient, amountUnits);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error("Automatic payout transaction did not confirm.");
    }
    return { txHash: tx.hash };
  }
}
