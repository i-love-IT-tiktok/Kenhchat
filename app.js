const GH_API = 'https://api.github.com';
let currentUser = null;
let dataCache = null; // { posts: [], users: [] }
let dataSha = null;   // SHA của data.json để update

// ===== GITHUB HELPERS =====
function ghHeaders() {
  const h = { 'Accept': 'application/vnd.github+json' };
  if (CONFIG.GITHUB_TOKEN) h['Authorization'] = 'Bearer ' + CONFIG.GITHUB_TOKEN;
  return h;
}

async function ghGetFile(path) {
  const url = `${GH_API}/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}?ref=${CONFIG.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub read error: ' + res.status);
  return res.json();
}

async function ghPutFile(path, base64Content, message, sha) {
  const url = `${GH_API}/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
  const body = {
    message: message,
    content: base64Content,
    branch: CONFIG.GITHUB_BRANCH
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'GitHub write error: ' + res.status);
  }
  return res.json();
}

async function ghDeleteFile(path, message, sha) {
  const url = `${GH_API}/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: CONFIG.GITHUB_BRANCH })
  });
  return res.ok;
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ===== DATA LOAD/SAVE =====
async function loadData() {
  if (dataCache) return dataCache;
  const file = await ghGetFile(CONFIG.DATA_PATH);
  if (!file) {
    dataCache = { posts: [], users: CONFIG.USERS.map(u => ({...u})) };
    dataSha = null;
    return dataCache;
  }
  dataSha = file.sha;
  try {
    dataCache = JSON.parse(base64ToUtf8(file.content));
  } catch (e) {
    dataCache = { posts: [], users: CONFIG.USERS.map(u => ({...u})) };
  }
  if (!dataCache.users) dataCache.users = CONFIG.USERS.map(u => ({...u}));
  if (!dataCache.posts) dataCache.posts = [];
  return dataCache;
}

async function saveData(message) {
  const content = utf8ToBase64(JSON.stringify(dataCache, null, 2));
  const res = await ghPutFile(CONFIG.DATA_PATH, content, message || 'Update data', dataSha);
  dataSha = res.content.sha;
}

// ===== AUTH =====
function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
  document.getElementById('registerForm').classList.toggle('hidden', isLogin);
  hideError();
}
function showError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.classList.add('show');
}
function hideError() { document.getElementById('authError').classList.remove('show'); }

async function doLogin(e) {
  e.preventDefault(); hideError();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
  try {
    const data = await loadData();
    const username = document.getElementById('loginUser').value.trim().toLowerCase();
    const password = document.getElementById('loginPass').value;
    const user = data.users.find(u => u.username === username && u.password === password);
    if (!user) throw new Error('Sai tên đăng nhập hoặc mật khẩu');
    currentUser = {
      username: user.username,
      displayName: user.displayName,
      color: user.color || '#667eea'
    };
    localStorage.setItem('bioUser', JSON.stringify(currentUser));
    showApp();
  } catch (err) { showError(err.message); }
  btn.disabled = false; btn.textContent = 'Đăng nhập';
}

async function doRegister(e) {
  e.preventDefault(); hideError();
  const btn = document.getElementById('regBtn');
  btn.disabled = true; btn.textContent = 'Đang tạo...';
  try {
    if (!CONFIG.GITHUB_TOKEN) {
      throw new Error('Cần token GitHub trong config.js để đăng ký');
    }
    const data = await loadData();
    const username = document.getElementById('regUser').value.trim().toLowerCase();
    const password = document.getElementById('regPass').value;
    const displayName = document.getElementById('regDisplay').value.trim();

    if (username.length < 3 || username.length > 30)
      throw new Error('Tên đăng nhập 3-30 ký tự');
    if (!/^[a-z0-9_]+$/.test(username))
      throw new Error('Chỉ dùng chữ thường, số, gạch dưới');
    if (password.length < 6)
      throw new Error('Mật khẩu 6+ ký tự');
    if (data.users.find(u => u.username === username))
      throw new Error('Tên đăng nhập đã tồn tại');

    const colors = ['#667eea','#764ba2','#f093fb','#4facfe','#43e97b','#fa709a','#ff6b6b','#feca57','#48dbfb','#ff9ff3'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    data.users.push({ username, password, displayName, color });
    await saveData('Register: ' + username);

    currentUser = { username, displayName, color };
    localStorage.setItem('bioUser', JSON.stringify(currentUser));
    showApp();
  } catch (err) { showError(err.message); }
  btn.disabled = false; btn.textContent = 'Tạo tài khoản';
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem('bioUser');
  showAuth();
}

function showAuth() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
}
function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  const av = document.getElementById('myAvatar');
  av.textContent = initial(currentUser.displayName);
  av.style.background = currentUser.color;
  document.getElementById('myName').textContent = currentUser.displayName;
  loadPosts();
}

// ===== UTILS =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : text;
  return div.innerHTML;
}
function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return Math.floor(diff/60) + ' phút trước';
  if (diff < 86400) return Math.floor(diff/3600) + ' giờ trước';
  if (diff < 604800) return Math.floor(diff/86400) + ' ngày trước';
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'});
}
function initial(name) { return (name || '?').charAt(0).toUpperCase(); }

// ===== RENDER =====
function fileUrl(path) {
  if (!path) return '';
  return `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH}/${path}`;
}

function renderFile(p) {
  if (!p.file_path) return '';
  const url = fileUrl(p.file_path);
  const name = escapeHtml(p.file_name || 'Tệp đính kèm');
  const t = p.file_type || '';
  if (t.startsWith('image/'))
    return `<a class="attachment" href="${url}" target="_blank">🖼️ ${name}<br><img src="${url}" alt="${name}"></a>`;
  if (t.startsWith('video/'))
    return `<div class="attachment">🎬 ${name}<br><video src="${url}" controls style="max-width:100%;margin-top:8px;border-radius:8px;"></video></div>`;
  if (t.startsWith('audio/'))
    return `<div class="attachment">🎵 ${name}<br><audio src="${url}" controls style="width:100%;margin-top:8px;"></audio></div>`;
  return `<a class="attachment" href="${url}" target="_blank" download>📎 ${name}</a>`;
}

function renderPost(p) {
  const avColor = p.avatar_color || '#667eea';
  const commentsHtml = (p.comments || []).map(c => {
    const cColor = c.user_color || '#667eea';
    const canDel = currentUser && c.user_id === currentUser.username;
    return `
      <div class="comment">
        <div class="c-avatar" style="background:${cColor}">${initial(c.name)}</div>
        <div class="c-body">
          <div>
            <span class="c-name">${escapeHtml(c.name)}</span>
            <span class="c-time">${formatTime(c.created_at)}</span>
          </div>
          <div class="c-text">${escapeHtml(c.content)}</div>
        </div>
        ${canDel ? `<button class="c-del" onclick="deleteComment('${p.id}', ${c.id})" title="Xóa">✕</button>` : ''}
      </div>`;
  }).join('') || '<div style="color:#999;font-size:13px;text-align:center;padding:8px;">Chưa có bình luận</div>';

  const delBtn = (currentUser && p.user_id === currentUser.username)
    ? `<button class="del-btn" onclick="deletePost('${p.id}')" title="Xóa bài">🗑️</button>` : '';

  const liked = currentUser && (p.hearts_users || []).includes(currentUser.username);
  const heartCount = (p.hearts_users || []).length;

  return `
    <div class="card post" data-id="${p.id}">
      <div class="post-header">
        <div class="avatar" style="background:${avColor}">${initial(p.name)}</div>
        <div class="post-meta">
          <div class="post-name">${escapeHtml(p.name)}</div>
          <div class="post-time">${formatTime(p.created_at)}</div>
        </div>
        ${delBtn}
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
      ${renderFile(p)}
      <div class="actions">
        <button class="heart-btn ${liked ? 'liked' : ''}" onclick="likePost('${p.id}', this)">
          ${liked ? '❤️' : '🤍'} <span class="heart-count">${heartCount}</span>
        </button>
        <button class="comment-toggle" onclick="toggleComments('${p.id}')">💬 Bình luận (${(p.comments || []).length})</button>
      </div>
      <div class="comments" id="comments-${p.id}">
        <div class="comment-list">${commentsHtml}</div>
        <div class="comment-form">
          <input type="text" name="ctext" placeholder="Viết bình luận..." maxlength="500">
          <button onclick="submitComment('${p.id}', this)">Gửi</button>
        </div>
      </div>
    </div>
  `;
}

async function loadPosts() {
  document.getElementById('loading').style.display = 'block';
  try {
    const data = await loadData();
    // sắp xếp mới nhất trước
    const posts = [...data.posts].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    document.getElementById('posts').innerHTML = posts.map(renderPost).join('') ||
      '<div class="card" style="text-align:center;color:#888;">Chưa có bài viết nào</div>';
  } catch (err) {
    document.getElementById('posts').innerHTML =
      `<div class="card" style="color:#e74c3c;">Lỗi tải dữ liệu: ${escapeHtml(err.message)}</div>`;
  }
  document.getElementById('loading').style.display = 'none';
}

// ===== ACTIONS =====
async function submitPost(e) {
  const content = document.getElementById('content').value.trim();
  const fileInput = document.getElementById('file');
  const file = fileInput.files[0];

  if (!content) return alert('Vui lòng nhập nội dung!');
  if (!CONFIG.GITHUB_TOKEN) return alert('Cần GitHub token trong config.js');

  const btn = e.target;
  btn.disabled = true; btn.textContent = 'Đang đăng...';

  try {
    const data = await loadData();
    const postId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    let file_path = null, file_name = null, file_type = null;

    if (file) {
      if (file.size > 24 * 1024 * 1024) throw new Error('File quá lớn (max 24MB)');
      const b64 = await fileToBase64(file);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uploadPath = `${CONFIG.UPLOAD_PATH}/${postId}_${safeName}`;
      await ghPutFile(uploadPath, b64, 'Upload: ' + safeName);
      file_path = uploadPath;
      file_name = file.name;
      file_type = file.type || 'application/octet-stream';
    }

    const newPost = {
      id: postId,
      user_id: currentUser.username,
      name: currentUser.displayName,
      avatar_color: currentUser.color,
      content,
      file_path, file_name, file_type,
      created_at: new Date().toISOString(),
      comments: [],
      hearts_users: []
    };

    data.posts.push(newPost);
    await saveData('Post: ' + postId);

    document.getElementById('content').value = '';
    fileInput.value = '';
    await loadPosts();
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
  btn.disabled = false; btn.textContent = '🚀 Đăng bài';
}

async function deletePost(postId) {
  if (!confirm('Xóa bài này?')) return;
  if (!CONFIG.GITHUB_TOKEN) return alert('Cần token');
  try {
    const data = await loadData();
    const idx = data.posts.findIndex(p => p.id === postId);
    if (idx === -1) return;
    const post = data.posts[idx];
    if (post.user_id !== currentUser.username) return alert('Không có quyền');

    // Xóa file nếu có
    if (post.file_path) {
      try {
        const f = await ghGetFile(post.file_path);
        if (f) await ghDeleteFile(post.file_path, 'Delete: ' + post.file_path, f.sha);
      } catch (e) { console.warn('Không xóa được file:', e); }
    }

    data.posts.splice(idx, 1);
    await saveData('Delete post: ' + postId);
    await loadPosts();
  } catch (err) { alert('Lỗi: ' + err.message); }
}

async function likePost(postId, btn) {
  if (!CONFIG.GITHUB_TOKEN) return alert('Cần token để thả tim');
  btn.classList.add('pop');
  setTimeout(() => btn.classList.remove('pop'), 400);
  try {
    const data = await loadData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.hearts_users) post.hearts_users = [];
    // Cho phép thả nhiều lần (không remove)
    post.hearts_users.push(currentUser.username);
    await saveData('Heart: ' + postId);
    btn.querySelector('.heart-count').textContent = post.hearts_users.length;
    btn.classList.add('liked');
    btn.childNodes[0].textContent = '❤️ ';
  } catch (err) { alert('Lỗi: ' + err.message); }
}

function toggleComments(id) {
  document.getElementById('comments-' + id).classList.toggle('open');
}

async function submitComment(postId, btn) {
  if (!CONFIG.GITHUB_TOKEN) return alert('Cần token để bình luận');
  const form = btn.parentElement;
  const input = form.querySelector('input[name="ctext"]');
  const content = input.value.trim();
  if (!content) return;

  try {
    const data = await loadData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.comments) post.comments = [];
    post.comments.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      user_id: currentUser.username,
      name: currentUser.displayName,
      user_color: currentUser.color,
      content,
      created_at: new Date().toISOString()
    });
    await saveData('Comment on: ' + postId);
    input.value = '';
    await loadPosts();
    document.getElementById('comments-' + postId).classList.add('open');
  } catch (err) { alert('Lỗi: ' + err.message); }
}

async function deleteComment(postId, commentId) {
  if (!confirm('Xóa bình luận này?')) return;
  try {
    const data = await loadData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return;
    const idx = post.comments.findIndex(c => c.id === commentId);
    if (idx === -1) return;
    if (post.comments[idx].user_id !== currentUser.username) return alert('Không có quyền');
    post.comments.splice(idx, 1);
    await saveData('Delete comment');
    await loadPosts();
    document.getElementById('comments-' + postId).classList.add('open');
  } catch (err) { alert('Lỗi: ' + err.message); }
}

// ===== INIT =====
(async function init() {
  const saved = localStorage.getItem('bioUser');
  if (saved) {
    try { currentUser = JSON.parse(saved); } catch(e) {}
  }
  if (currentUser) showApp();
  else showAuth();
})();
