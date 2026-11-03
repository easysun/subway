import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";
import Subway from "../components/subway";

export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <Subway user={user ? { name: user.fullName || "我的空間", email: user.email } : null} signInUrl={chatGPTSignInPath("/")} signOutUrl={chatGPTSignOutPath("/")} />;
}
