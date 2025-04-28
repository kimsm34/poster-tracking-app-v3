// pages/_app.tsx
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { AuthProvider } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <RequireAuth>
        <Component {...pageProps} />
      </RequireAuth>
    </AuthProvider>
  );
}

export default MyApp;