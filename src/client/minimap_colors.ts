import { ObjectType, TileType } from "../shared/protocol";

export function minimapColorForTile(tileType: TileType): [number, number, number] {
  switch (tileType) {
    case TileType.Water:
      return [70, 124, 173];
    case TileType.Stone:
    case TileType.StoneDug:
      return [146, 149, 152];
    case TileType.Forest:
    case TileType.ForestDug:
      return [58, 93, 45];
    case TileType.Hill:
    case TileType.HillDug:
      return [128, 118, 103];
    case TileType.Dirt:
    case TileType.DirtDug:
      return [138, 103, 68];
    case TileType.BarleyField:
      return [168, 156, 86];
    case TileType.WheatField:
      return [188, 168, 90];
    case TileType.Orchard:
      return [98, 137, 75];
    case TileType.Vineyard:
      return [104, 112, 75];
    case TileType.Garden:
      return [115, 146, 81];
    case TileType.PumpkinPatch:
      return [152, 113, 61];
    case TileType.CabbagePatch:
      return [100, 143, 90];
    case TileType.BerryGarden:
      return [116, 103, 80];
    case TileType.HerbGarden:
      return [96, 151, 109];
    case TileType.FallowField:
      return [142, 113, 81];
    case TileType.GrassDug:
      return [126, 111, 74];
    case TileType.Grass:
    default:
      return [111, 168, 79];
  }
}

export function minimapColorForObject(type: ObjectType): [number, number, number] | null {
  switch (type) {
    case ObjectType.House:
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Market:
    case ObjectType.Manor:
    case ObjectType.TownHall:
    case ObjectType.Windmill:
    case ObjectType.Well:
      return [214, 188, 138];
    case ObjectType.Tree:
    case ObjectType.AppleTree:
    case ObjectType.OliveTree:
      return [36, 72, 31];
    case ObjectType.GrainEar:
    case ObjectType.YellowGrainEar:
    case ObjectType.GreenGrainEar:
    case ObjectType.GrapeVine:
      return [132, 151, 72];
    case ObjectType.Horse:
    case ObjectType.Sheep:
    case ObjectType.Dog:
    case ObjectType.Cat:
      return [182, 166, 144];
    default:
      return null;
  }
}
