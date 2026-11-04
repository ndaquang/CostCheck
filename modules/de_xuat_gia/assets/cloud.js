/* Kết nối Supabase cho mục "Điền giá BOQ" (chỉ bản admin).
 * - Chỉ gọi đúng 1 domain Supabase (CSP của bản admin cho phép đúng domain này).
 * - Khóa dưới đây là khóa CÔNG KHAI (publishable): an toàn khi nằm trong mã. Dữ liệu được bảo vệ bởi
 *   đăng nhập Supabase Auth + RLS (chỉ app_metadata.role = 'admin'), không phải bởi việc giấu khóa.
 * - Token đăng nhập chỉ giữ trong bộ nhớ trang; tải lại trang là đăng xuất.
 * - Mỗi lần lưu là một PHIÊN BẢN MỚI; không ghi đè, không xóa được qua API. */
(function () {
  'use strict';
  const URL_ = 'https://jzwmzpwcpjvhpylkhapg.supabase.co';
  const KEY = 'sb_publishable_fHLD4RIdRQVZ_R-ud9aMFA_ORNbxBUH';
  let tok = null, refresh = null, exp = 0, email = '';

  async function raw(path, opt = {}, bearer) {
    const r = await fetch(URL_ + path, {
      ...opt, referrerPolicy: 'no-referrer', credentials: 'omit',
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(opt.headers || {}) },
    });
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { /* không phải JSON */ }
    if (!r.ok) { const e = new Error((j && (j.msg || j.message || j.error_description)) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return j;
  }
  function setSession(j) {
    tok = j.access_token; refresh = j.refresh_token; exp = Date.now() + (j.expires_in || 3600) * 1000 - 60000;
    email = (j.user && j.user.email) || email;
  }
  async function bearer() {
    if (!tok) throw new Error('Chưa đăng nhập Supabase.');
    if (Date.now() > exp && refresh) setSession(await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) }));
    return tok;
  }
  const rest = async (path, opt) => raw('/rest/v1/' + path, opt, await bearer());

  window.DXGCloud = {
    get email() { return email; },
    get signedIn() { return !!tok; },
    async login(mail, pass) {
      setSession(await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: mail, password: pass }) }));
      email = mail;
      // Kiểm tra quyền admin: RLS trả rỗng/lỗi nếu không đúng vai trò.
      try { await rest('dxg_projects?select=id&limit=1'); }
      catch (e) { this.logout(); throw new Error('Tài khoản này không có quyền admin trên Supabase.'); }
    },
    logout() { tok = refresh = null; exp = 0; email = ''; },
    listProjects() { return rest('dxg_projects?select=id,name,created_at&archived=eq.false&order=name.asc'); },
    async createProject(name) {
      const r = await rest('dxg_projects', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name }) });
      return r[0];
    },
    async saveVersion(projectId, fileName, payload) {
      const r = await rest('dxg_versions', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ project_id: projectId, file_name: fileName, payload, item_count: (payload.items || []).length }) });
      return r[0];
    },
    listVersions(projectId) { return rest(`dxg_versions?select=id,version,file_name,item_count,created_at&project_id=eq.${encodeURIComponent(projectId)}&order=version.desc&limit=50`); },
    async getVersion(id) { const r = await rest(`dxg_versions?select=payload&id=eq.${encodeURIComponent(id)}`); return r[0] && r[0].payload; },
  };
})();
