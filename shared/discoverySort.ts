export type DiscoverySortColumn = "name" | "status" | "updatedAt";
export type DiscoverySortDirection = "asc" | "desc";

export type SortableDiscoveryProject = {
  name: string;
  status: string;
  updatedAt: string | null;
};

function compareNullableText(left: string | null, right: string | null) {
  return (left || "").localeCompare(right || "");
}

/**
 * Returns a newly ordered project list; it never mutates the discovery data
 * received from the protected workspace route.
 */
export function sortDiscoveryProjects<T extends SortableDiscoveryProject>(projects: T[], column: DiscoverySortColumn, direction: DiscoverySortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...projects].sort((left, right) => {
    const comparison = column === "name"
      ? left.name.localeCompare(right.name)
      : column === "status"
        ? left.status.localeCompare(right.status) || left.name.localeCompare(right.name)
        : compareNullableText(left.updatedAt, right.updatedAt) || left.name.localeCompare(right.name);
    return comparison * multiplier;
  });
}
