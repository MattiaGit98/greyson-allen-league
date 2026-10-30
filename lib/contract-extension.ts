/** Aumento del 20% del costo corrente, con arrotondamento per eccesso. */
export function contractExtensionCost(cost: number) {
  return cost + Math.ceil(cost / 5);
}
