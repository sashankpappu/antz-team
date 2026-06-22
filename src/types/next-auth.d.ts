import type { AppRole } from "@/lib/rbac";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** App role, mapped to gbrain scopes on every brain read. */
      role: AppRole;
      /** The user's gbrain login slice — all brain reads scope to this. */
      gbrainLogin: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
    gbrainLogin?: string;
  }
}
