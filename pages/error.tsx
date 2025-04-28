// pages/_error.tsx
import React from 'react';
import type { NextPageContext } from 'next';

type ErrorProps = {
  statusCode?: number;
};

const ErrorPage = ({ statusCode }: ErrorProps) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-4">
        {statusCode
          ? `서버 에러: ${statusCode}`
          : '클라이언트 에러가 발생했습니다'}
      </h1>
      <p className="text-gray-600 mb-6">
        잠시 후 다시 시도해 주세요.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        다시 로드 
      </button>
    </div>
  );
};

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode;
  return { statusCode };
};

export default ErrorPage;