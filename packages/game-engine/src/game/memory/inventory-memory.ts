import type { ItemState, LivingGameState, NFTObjectState } from "./game-state.types";

export function updateInventoryItem(state: LivingGameState, item: Partial<ItemState> & { id: string }): LivingGameState {
  return { ...state, inventory: { ...state.inventory, [item.id]: { ...(state.inventory[item.id] ?? { id: item.id, state: "intacto", storyMarks: [], notes: [] }), ...item } } };
}

export function updateNFTObject(state: LivingGameState, item: Partial<NFTObjectState> & { id: string; tokenTemplateId: string }): LivingGameState {
  return { ...state, nftObjects: { ...state.nftObjects, [item.id]: { ...(state.nftObjects[item.id] ?? { id: item.id, tokenTemplateId: item.tokenTemplateId, state: "intacto", storyMarks: [], notes: [], corrupted: false, blessed: false }), ...item } } };
}
