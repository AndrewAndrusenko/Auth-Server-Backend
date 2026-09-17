import { TAcRole } from "./shared-models";

export interface IAccessRole {
  route: string;
  roles: TAcRole[];
}
export const ACCESS_ROUTES_ROLES: IAccessRole[] = [
  { route: "/users/userData", roles: ["user", "admin"] },
  { route: "/admin", roles: ["admin"] },
  { route: "/admin/getAllTokens", roles: ["admin"] },
  { route: "/admin/delToken", roles: ["admin"] },
  { route: "/admin/all", roles: ["admin"] },
  { route: "/admin/user-del", roles: ["admin"] },
];
