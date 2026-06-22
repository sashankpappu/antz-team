"use server";

import { signIn, signOut } from "@/auth";

export async function devSignIn() {
  await signIn("dev", { redirectTo: "/" });
}

export async function entraSignIn() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

export async function doSignOut() {
  await signOut({ redirectTo: "/login" });
}
