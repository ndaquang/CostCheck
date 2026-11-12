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
      // Kiểm tra quyền admin ngay từ token (RLS chỉ trả rỗng, không báo lỗi, nên không dùng truy vấn để kiểm tra).
      let role = '';
      try { role = (JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).app_metadata || {}).role || ''; } catch (e) { /* token lạ */ }
      if (role !== 'admin') { this.logout(); throw new Error('Tài khoản này chưa có vai trò admin trên Supabase. Nhờ quản trị cấp quyền rồi đăng nhập lại.'); }
    },
    // Liên kết một lần: đăng nhập bằng mật khẩu Supabase hiện có, rồi đổi mật khẩu đó thành khóa dẫn xuất từ gói admin.
    async link(mail, oldPass, secret) {
      setSession(await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: mail, password: oldPass }) }));
      await raw('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: secret }) }, tok);
      this.logout();
      await this.login(mail, secret);
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
    // ---- Kho đơn giá tra cứu (sheet "PHAN TICH THEO MA"): mỗi lần lưu là một lô mới, không ghi đè ----
    async ensureProject(name) {
      const ps = await this.listProjects(), k = String(name).trim().toLowerCase();
      return ps.find(p => p.name.trim().toLowerCase() === k) || this.createProject(String(name).trim());
    },
    async savePrices(projectId, fileName, rows) {
      const batch = (crypto.randomUUID && crypto.randomUUID()) || ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
      for (let i = 0; i < rows.length; i += 400) {
        const part = rows.slice(i, i + 400).map(r => ({ project_id: projectId, batch_id: batch, source_file: fileName, description: r.description, desc_search: r.desc_search,
          unit_raw: r.unit_raw, unit_norm: r.unit_norm, multi_unit: r.multi_unit, unit_price: r.unit_price }));
        await rest('dxg_price_lookup', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(part) });
      }
      return { batch, count: rows.length };
    },
    // Xóa toàn bộ đơn giá (mọi lô) của một dự án; trả về số dòng đã xóa
    async deletePrices(projectId) {
      const r = await rest('dxg_price_lookup?project_id=eq.' + encodeURIComponent(projectId), { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      return (r || []).length;
    },
    // Lô mới nhất của mỗi dự án (phân trang 1000 dòng); projectId rỗng = mọi dự án
    async loadPrices(projectId) {
      const out = [], flt = projectId ? '&project_id=eq.' + encodeURIComponent(projectId) : '';
      for (let off = 0; ; off += 1000) {
        const part = await rest('dxg_price_lookup_latest?select=id,project_id,description,desc_search,unit_raw,unit_norm,multi_unit,unit_price,source_file,created_at&order=id.asc&limit=1000&offset=' + off + flt);
        out.push(...part); if (part.length < 1000) return out;
      }
    },
    async getVersion(id) { const r = await rest(`dxg_versions?select=payload&id=eq.${encodeURIComponent(id)}`); return r[0] && r[0].payload; },
  };
})();
