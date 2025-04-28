import React, { useState } from "react";
import { useRouter } from "next/router";
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  UserCredential,
  signOut,
  sendEmailVerification,
} from "firebase/auth";
import { setDoc, doc, serverTimestamp } from "firebase/firestore";

export function EmailAuthForm() {
  const router = useRouter();
  const { redirect } = router.query;
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      let cred: UserCredential;
      if (mode === "signup") {
        console.log("🟢 Starting signup flow");
        cred = await createUserWithEmailAndPassword(auth, email, password);
        console.log(`🟢 Account created for user ${cred.user.uid}`);
        await sendEmailVerification(cred.user);
        console.log("🟢 Email verification sent");

        try {
          await setDoc(doc(db, "profiles", cred.user.uid), {
            email: cred.user.email,
            role: "pending",
            createdAt: serverTimestamp(),
          });
          console.log(`🟢 Firestore profile created for ${cred.user.uid}`);
        } catch (firestoreError) {
          console.error('🔴 Failed to create Firestore profile:', firestoreError);
        }

        try {
          const res = await fetch('/api/setRole', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: cred.user.uid, role: 'pending', region: 'pending' }),
          });
          if (!res.ok) {
            throw new Error('Failed to set role in Auth');
          }
          // Refresh ID token after custom claims update
          await cred.user.getIdToken(true);
          console.log("🟢 Token refreshed after setting role");
          console.log("🟢 Auth Custom Claims role set to pending");
        } catch (apiError) {
          console.error('🔴 Failed to call /api/setRole:', apiError);
        }

        setError('인증 이메일을 보냈습니다. 확인 후 다시 로그인해 주세요.');
        return;
      } else {
        console.log("🟢 Starting login flow");
        cred = await signInWithEmailAndPassword(auth, email, password);
        console.log(`🟢 Login successful for user ${cred.user.uid}`);
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user);
          console.log("🟡 Email not verified, verification email resent");
          await signOut(auth);
          setError('이메일이 인증되지 않았습니다. 인증 메일을 다시 보냈습니다.');
          return;
        }
      }
      console.log("🟢 인증 성공", cred.user.uid);

      if (!router.isReady) {
        console.warn("🚨 Router not ready yet!");
        return;
      }

      await cred.user.getIdToken(true);
      console.log("🟢 Token refreshed after login");
      const idTokenResult = await cred.user.getIdTokenResult();
      const claimsRole = idTokenResult.claims.role as string | undefined;

      console.log("🎯 User role after refresh:", claimsRole);

      const destination = typeof redirect === "string" && redirect ? `${redirect}` : "/";
      console.log("🚀 final destination:", destination);
      router.replace(destination);
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded shadow">
      <h1 className="text-2xl font-bold mb-4">
        {mode === "signup" ? "회원가입" : "로그인"}
      </h1>

      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <label className="block mb-2">
        <span className="font-semibold">이메일</span>
        <input
          type="email"
          className="mt-1 w-full p-2 border rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="block mb-4">
        <span className="font-semibold">비밀번호</span>
        <input
          type="password"
          className="mt-1 w-full p-2 border rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <button
        onClick={submit}
        className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
      >
        {mode === "signup" ? "가입하기" : "로그인"}
      </button>

      <p className="mt-4 text-center text-sm text-gray-600">
        {mode === "signup"
          ? "이미 계정이 있나요?"
          : "계정이 없으신가요?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError(null);
          }}
          className="text-blue-600 underline"
        >
          {mode === "signup" ? "로그인" : "회원가입"}
        </button>
      </p>
    </div>
  );
}