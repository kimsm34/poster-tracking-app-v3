import { useAuth } from '@/components/AuthProvider';
import { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/router';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import ExcelUploadFrontend from '@/components/ExcelUploadFrontend';

type UserProfile = {
  uid: string;
  email: string;
  role: string;
  regions: string[];
};

export default function AdminPage() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, role } = useAuth();

  const regions = ['북구', '남구', '달성군']; // 구 목록

  type RegionOption = typeof regions[number];
  type RoleOption = 'admin' | 'leader' | 'member' | 'election' | 'rejected' | 'pending';

  const [selectedRegions, setSelectedRegions] = useState<Record<string, RegionOption[]>>({});

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<RoleOption>('member');
  const [editingRegions, setEditingRegions] = useState<Record<string, RegionOption[]>>(selectedRegions);

  const roleLabelMap: { [key: string]: string } = {
    admin: "관리자",
    leader: "팀장",
    member: "팀원",
    election: "선관위",
    pending: "대기 중",
  };

  useEffect(() => {
    if (!user) return;
    if (role !== 'admin') {
      console.warn(`❗ Not an admin: ${user.email} (${user.uid}). Redirecting to home...`);
      router.replace('/');
    }
  }, [user, role, router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  useEffect(() => {
    const fetchProfiles = async () => {
      console.log('[AdminPage] fetchProfiles: starting fetch of profiles');
      const snapshot = await getDocs(collection(db, 'profiles'));
      const list: UserProfile[] = snapshot.docs.map((doc) => ({
        uid: doc.id,
        email: doc.data().email,
        role: doc.data().role,
        regions: doc.data().regions || [],
      }));
      console.log('[AdminPage] fetchProfiles: fetched profiles:', list);
      const initRegions: Record<string, RegionOption[]> = {};
      list.forEach(p => {
        const regionsForUser: RegionOption[] = p.regions || [];
        initRegions[p.uid] = regionsForUser;
      });
      console.log('[AdminPage] fetchProfiles: initializing selectedRegions:', initRegions);
      setProfiles(list);
      setSelectedRegions(initRegions);
    };

    fetchProfiles();
  }, []);

  const approveUser = async (
    profile: UserProfile,
    newRole: RoleOption,
    newRegions: RegionOption[]
  ) => {
    console.log(`[AdminPage] approveUser: profile=${profile.uid}, currentRole=${profile.role}, newRole=${newRole}, newRegions=${newRegions}`);
    if (profile.role !== 'pending' && profile.role !== 'unapproved') {
      alert('이미 승인된 사용자입니다.');
      return;
    }

    // skip region requirement for admins
    if (newRole !== 'admin' && (!newRegions || newRegions.length === 0)) {
      alert('최소 하나 이상의 구를 선택해야 합니다.');
      return;
    }

    console.log('Selected newRegions:', newRegions);

    setLoading(true);
    try {
      // 1️⃣ Firestore 업데이트
      console.log('[AdminPage] approveUser: updating Firestore for', profile.uid);
      await updateDoc(doc(db, 'profiles', profile.uid), {
        role: newRole,
        regions: newRole === 'admin' ? [] : newRegions,
      });
      console.log('[AdminPage] approveUser: Firestore update successful for', profile.uid);
      console.log(`✅ Firestore: ${profile.email} (${profile.uid}) 역할이 ${newRole}(으)로, 구가 ${newRole === 'admin' ? [] : newRegions}로 변경되었습니다.`);

      // 2️⃣ API 호출해서 Custom Claims 업데이트
      console.log('[AdminPage] approveUser: sending custom claims request for', profile.uid);
      const res = await fetch('/api/setRole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: profile.uid,
          role: newRole,
          regions: newRole === 'admin' ? [] : newRegions,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to set Auth Custom Claims');
      }
      console.log(`✅ Auth Claims: ${profile.email} (${profile.uid}) 역할이 ${newRole}(으)로 설정되었습니다.`);

      // Log updated custom claims from API response
      const result = await res.json();
      console.log('[AdminPage] approveUser: custom claims response:', result);
      console.log(`✅ Updated user ${profile.uid} custom claims:`, result.claims);

      alert('승인 완료!');
      window.location.reload(); // ✅ 추가: 승인 완료 후 자동 새로고침
    } catch (error: any) {
      console.error('[AdminPage] approveUser: error occurred for', profile.uid, error);
      alert(`승인 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChange = async (profile: UserProfile) => {
    const newRole = editingRole;
    const newRegions = editingRegions[profile.uid] || [];
    console.log(`[AdminPage] handleSaveChange: profile=${profile.uid}, editingRole=${newRole}, editingRegions=${newRegions}`);
    // skip region requirement for admins
    if (editingRole !== 'admin' && newRegions.length === 0) {
      alert('최소 하나 이상의 구를 선택해야 합니다.');
      return;
    }
    setLoading(true);
    try {
      console.log('[AdminPage] handleSaveChange: updating Firestore for', profile.uid);
      await updateDoc(doc(db, 'profiles', profile.uid), {
        role: newRole,
        regions: newRole === 'admin' ? [] : newRegions,
      });
      console.log('[AdminPage] handleSaveChange: Firestore update successful for', profile.uid);
      console.log('[AdminPage] handleSaveChange: sending custom claims request for', profile.uid);
      const res = await fetch('/api/setRole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: profile.uid,
          role: newRole,
          regions: newRole === 'admin' ? [] : newRegions,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to set Auth Custom Claims');
      }
      // Log updated custom claims from API response
      const result = await res.json();
      console.log('[AdminPage] handleSaveChange: custom claims response:', result);
      console.log(`✅ Updated user ${profile.uid} custom claims:`, result.claims);

      alert('변경 완료!');
      window.location.reload();
    } catch (error: any) {
      console.error('[AdminPage] handleSaveChange: error occurred for', profile.uid, error);
      alert(`변경 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-end mb-4 space-x-4">
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
        >
          메인 페이지로
        </button>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          로그아웃
        </button>
      </div>
      <h1 className="text-2xl font-bold mb-6">가입자 승인 페이지</h1>
      <section className="mb-8">
        <p className="mb-2 text-sm text-gray-600">
          엑셀 파일은 <strong>번호, 동별연변, 이름, 주소, 구, 첩부장소, 첩부형태, 면적, 참고사항</strong> 형태로 구성되어야 합니다.
        </p>
        <ExcelUploadFrontend />
      </section>

      {profiles.length === 0 ? (
        <p>가입자가 없습니다.</p>
      ) : (
        <table className="w-full table-auto border">
          <caption className="sr-only">가입자 승인 테이블</caption>
          <thead>
            <tr>
              <th className="border p-2">이메일</th>
              <th className="border p-2">권한</th>
              <th className="border p-2">지역</th> {/* 지역 선택 */}
              <th className="border p-2">승인</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.uid}>
                <td className="border p-2">{profile.email}</td>
                <td className="border p-2">{roleLabelMap[profile.role] ?? profile.role}</td>
                <td className="border p-2">{profile.regions.join(', ')}</td>
                <td className="border p-2">
                  {/* 지역 선택 체크박스 추가 */}
                  {(profile.role === 'pending' || profile.role === 'unapproved') && (
                    <div>
                      {regions.map((region) => (
                        <label key={region} className="mr-2">
                          <input
                            type="checkbox"
                            checked={selectedRegions[profile.uid]?.includes(region) ?? false}
                            onChange={() => {
                              setSelectedRegions(prev => {
                                const currentRegions = prev[profile.uid] ?? [];
                                if (currentRegions.includes(region)) {
                                  return {
                                    ...prev,
                                    [profile.uid]: currentRegions.filter(r => r !== region),
                                  };
                                } else {
                                  return {
                                    ...prev,
                                    [profile.uid]: [...currentRegions, region],
                                  };
                                }
                              });
                            }}
                            disabled={loading}
                          />
                          {region}
                        </label>
                      ))}
                    </div>
                  )}
                </td>
                <td className="border p-2">
                  {(profile.role === 'pending' || profile.role === 'unapproved') ? (
                    <>
                      <button
                        onClick={() => approveUser(profile, 'admin', selectedRegions[profile.uid] || [])}
                        className="px-2 py-1 bg-purple-600 text-white rounded mr-2"
                        disabled={loading}
                      >
                        관리자
                      </button>
                      <button
                        onClick={() => approveUser(profile, 'leader', selectedRegions[profile.uid] || [])}
                        className="px-2 py-1 bg-green-600 text-white rounded mr-2"
                        disabled={loading}
                      >
                        팀장
                      </button>
                      <button
                        onClick={() => approveUser(profile, 'member', selectedRegions[profile.uid] || [])}
                        className="px-2 py-1 bg-blue-600 text-white rounded mr-2"
                        disabled={loading}
                      >
                        팀원
                      </button>
                      <button
                        onClick={() => approveUser(profile, 'election', selectedRegions[profile.uid] || [])}
                        className="px-2 py-1 bg-yellow-500 text-white rounded mr-2"
                        disabled={loading}
                      >
                        선관위
                      </button>
                      <button
                        onClick={() => approveUser(profile, 'rejected', selectedRegions[profile.uid] || [])}
                        className="px-2 py-1 bg-red-500 text-white rounded"
                        disabled={loading}
                      >
                        거절
                      </button>
                    </>
                  ) : editingUserId === profile.uid ? (
                    <div>
                      {/* role selection */}
                      <div className="mb-2">
                        <label className="block text-sm font-semibold">역할:</label>
                        <select
                          value={editingRole}
                          onChange={(e) => setEditingRole(e.target.value as RoleOption)}
                          className="border p-1 rounded text-sm"
                        >
                          {['admin', 'leader', 'member', 'election'].map(r => (
                            <option key={r} value={r}>{roleLabelMap[r]}</option>
                          ))}
                        </select>
                      </div>
                      {/* region checkboxes */}
                      <div className="mb-2">
                        <span className="block text-sm font-semibold">지역 선택:</span>
                        {regions.map(region => (
                          <label key={region} className="inline-flex items-center mr-2">
                            <input
                              type="checkbox"
                              checked={editingRegions[profile.uid]?.includes(region) ?? false}
                              onChange={() => {
                                setEditingRegions(prev => {
                                  const curr = prev[profile.uid] ?? [];
                                  return {
                                    ...prev,
                                    [profile.uid]: curr.includes(region)
                                      ? curr.filter(r => r !== region)
                                      : [...curr, region],
                                  };
                                });
                              }}
                              disabled={loading}
                            />
                            <span className="ml-1">{region}</span>
                          </label>
                        ))}
                      </div>
                      {/* save/cancel buttons */}
                      <button
                        onClick={() => handleSaveChange(profile)}
                        className="px-2 py-1 bg-blue-600 text-white rounded mr-2 text-sm"
                        disabled={loading}
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingUserId(null)}
                        className="px-2 py-1 bg-gray-400 text-white rounded text-sm"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      {profile.role === 'rejected' ? (
                        <span className="text-red-500 font-semibold">거절됨</span>
                      ) : (
                        <span className="text-green-500 font-semibold">승인 완료</span>
                      )}
                      <button
                        onClick={() => {
                          setEditingUserId(profile.uid);
                          setEditingRole(profile.role as RoleOption);
                          setEditingRegions(prev => ({ ...prev, [profile.uid]: selectedRegions[profile.uid] || [] }));
                        }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-sm"
                        disabled={loading}
                      >
                        변경
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}