import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { AppRole } from "@/lib/rbac";

/**
 * Auth.js (NextAuth v5) — Microsoft Entra ID for v1 (§3, §5).
 *
 * Local dev gets a one-click "Sign in as CEO" Credentials provider so the
 * CEO dogfood script needs no identity provider. It is gated behind
 * AUTH_DEV_MODE and MUST be disabled (AUTH_DEV_MODE=false) anywhere shared.
 */

const devModeEnabled = process.env.AUTH_DEV_MODE !== "false";
const entraConfigured = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
);

const providers: NextAuthConfig["providers"] = [];

if (entraConfigured) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}

if (devModeEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Demo executive",
      credentials: {},
      // No password: this is the local demo identity, gated by AUTH_DEV_MODE.
      authorize: async () => ({
        id: "dev-ceo",
        name: "Demo CEO",
        email: "cl_executive@antz.ai",
        role: "admin" satisfies AppRole,
      }),
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // First sign-in: attach role + provision the gbrain login slice.
        token.role = (user as { role?: AppRole }).role ?? "member";
        token.gbrainLogin = token.email ? `gbrain:${token.email}` : `gbrain:${token.sub}`;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub ?? "unknown";
      session.user.role = token.role ?? "member";
      session.user.gbrainLogin = token.gbrainLogin ?? `gbrain:${session.user.id}`;
      return session;
    },
  },
});

export const authMeta = {
  devModeEnabled,
  entraConfigured,
};
