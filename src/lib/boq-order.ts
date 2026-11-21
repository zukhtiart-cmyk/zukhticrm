/** Room order for a BOQ / quote: the saved order first, then any other rooms in the order they were added. */
export function orderedRooms(items: { room: string; createdAt?: Date | null }[], saved: string[]) {
  const seen: string[] = [];
  for (const i of [...items].sort((a, b) => +(a.createdAt ?? 0) - +(b.createdAt ?? 0))) if (!seen.includes(i.room)) seen.push(i.room);
  return [...saved.filter((r) => seen.includes(r)), ...seen.filter((r) => !saved.includes(r))];
}

export function sortItems<T extends { sortOrder: number; createdAt?: Date | null }>(items: T[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || +(a.createdAt ?? 0) - +(b.createdAt ?? 0));
}
