// pages/login.tsx
import React from "react";
import { EmailAuthForm } from "@/components/EmailAuthForm";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { user, role, logout } = useAuth();
  console.log('[LoginPage] user:', user, 'role:', role);

  if (user && !user.emailVerified) {
    console.log('[LoginPage] Redirecting to email verification UI');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-bold mb-4">이메일 인증이 필요합니다.</h1>
        <p className="text-gray-600">
          가입하신 이메일로 발송된 인증 메일을 확인하고, 인증을 완료한 후 다시 로그인해 주세요.
        </p>
        <button
          onClick={logout}
          className="mt-6 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          로그아웃
        </button>
      </div>
    );
  }

  if (user && role === 'rejected') {
    console.log('[LoginPage] Access denied for rejected user:', user.uid);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-bold mb-4">접근 거부됨</h1>
        <p className="text-gray-600">
          관리자에 의해 접근이 거부되었습니다. 문의가 필요하시면 관리자에게 연락하세요.
        </p>
        <button
          onClick={logout}
          className="mt-6 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          로그아웃
        </button>
      </div>
    );
  }

  if (user && role === "pending") {
    console.log('[LoginPage] User pending approval:', user.uid);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-bold mb-4">승인 대기 중입니다.</h1>
        <p className="text-gray-600">
          관리자의 승인을 기다려주세요. 승인이 완료되면 다시 로그인할 수 있습니다.
        </p>
        <button
          onClick={logout}
          className="mt-6 bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          로그아웃
        </button>
      </div>
    );
  }

  console.log('[LoginPage] Showing login form');
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <EmailAuthForm />
    </div>
  );
}
