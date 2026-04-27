const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  projects: path.join(DATA_DIR, 'projects.json'),
  stats: path.join(DATA_DIR, 'stats.json'),
  config: path.join(DATA_DIR, 'config.json'),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  for (const [key, filepath] of Object.entries(FILES)) {
    if (!fs.existsSync(filepath)) {
      const defaults = {
        users: { users: {} },
        projects: { projects: {} },
        stats: { totalReactions: 0, todayReactions: 0, totalUsers: 0, totalProjects: 0, todayResetDate: new Date().toISOString().split('T')[0] },
        config: { adminChats: [], broadcastList: [] },
      };
      fs.writeFileSync(filepath, JSON.stringify(defaults[key], null, 2));
    }
  }
}

function readFile(filepath) {
  try {
    const data = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('DB read error:', err.message);
    return {};
  }
}

function writeFile(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('DB write error:', err.message);
    return false;
  }
}

// Users
function getUsers() {
  return readFile(FILES.users);
}

function saveUsers(data) {
  return writeFile(FILES.users, data);
}

function getUser(userId) {
  const db = getUsers();
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      username: '',
      verified: { telegram: false, youtube: false, whatsapp: false },
      dailyLimit: parseInt(process.env.DEFAULT_DAILY_LIMIT) || 200,
      usedToday: 0,
      lastReset: new Date().toISOString().split('T')[0],
      credits: 0,
      joinedAt: new Date().toISOString(),
      banned: false,
    };
    saveUsers(db);
  }
  return db.users[userId];
}

function updateUser(userId, updates) {
  const db = getUsers();
  if (!db.users[userId]) db.users[userId] = getUser(userId);
  db.users[userId] = { ...db.users[userId], ...updates };
  saveUsers(db);
  return db.users[userId];
}

function getAllUsers() {
  const db = getUsers();
  return Object.values(db.users);
}

// Projects
function getProjects() {
  return readFile(FILES.projects);
}

function saveProjects(data) {
  return writeFile(FILES.projects, data);
}

function getUserProjects(userId) {
  const db = getProjects();
  return db.projects[userId] || [];
}

function addProject(userId, project) {
  const db = getProjects();
  if (!db.projects[userId]) db.projects[userId] = [];
  db.projects[userId].push(project);
  saveProjects(db);
  return project;
}

function removeProject(userId, projectId) {
  const db = getProjects();
  if (!db.projects[userId]) return false;
  db.projects[userId] = db.projects[userId].filter(p => p.id !== projectId);
  saveProjects(db);
  return true;
}

function updateProject(userId, projectId, updates) {
  const db = getProjects();
  if (!db.projects[userId]) return null;
  const idx = db.projects[userId].findIndex(p => p.id === projectId);
  if (idx === -1) return null;
  db.projects[userId][idx] = { ...db.projects[userId][idx], ...updates };
  saveProjects(db);
  return db.projects[userId][idx];
}

function findProjectByChatId(chatId) {
  const db = getProjects();
  for (const userId of Object.keys(db.projects)) {
    const found = db.projects[userId].find(p => p.chatId === chatId && p.status === 'active');
    if (found) return { userId: parseInt(userId), project: found };
  }
  return null;
}

function getAllProjects() {
  const db = getProjects();
  let all = [];
  for (const userId of Object.keys(db.projects)) {
    all = all.concat(db.projects[userId].map(p => ({ ...p, userId: parseInt(userId) })));
  }
  return all;
}

// Stats
function getStats() {
  return readFile(FILES.stats);
}

function saveStats(data) {
  return writeFile(FILES.stats, data);
}

function incrementReactions(count = 1) {
  const stats = getStats();
  stats.totalReactions = (stats.totalReactions || 0) + count;
  stats.todayReactions = (stats.todayReactions || 0) + count;
  saveStats(stats);
}

function resetDailyStats() {
  const stats = getStats();
  const today = new Date().toISOString().split('T')[0];
  if (stats.todayResetDate !== today) {
    stats.todayReactions = 0;
    stats.todayResetDate = today;
    saveStats(stats);
  }
}

function updateTotalUsers() {
  const stats = getStats();
  const db = getUsers();
  stats.totalUsers = Object.keys(db.users).length;
  saveStats(stats);
}

function updateTotalProjects() {
  const stats = getStats();
  const db = getProjects();
  let count = 0;
  for (const userId of Object.keys(db.projects)) {
    count += db.projects[userId].length;
  }
  stats.totalProjects = count;
  saveStats(stats);
}

// Config / Admin Chats
function getConfig() {
  return readFile(FILES.config);
}

function saveConfig(data) {
  return writeFile(FILES.config, data);
}

function addAdminChat(chatId) {
  const config = getConfig();
  if (!config.adminChats.includes(chatId)) {
    config.adminChats.push(chatId);
    saveConfig(config);
  }
}

function removeAdminChat(chatId) {
  const config = getConfig();
  config.adminChats = config.adminChats.filter(id => id !== chatId);
  saveConfig(config);
}

function getAdminChats() {
  return getConfig().adminChats || [];
}

function addBroadcastUser(userId) {
  const config = getConfig();
  if (!config.broadcastList) config.broadcastList = [];
  if (!config.broadcastList.includes(userId)) {
    config.broadcastList.push(userId);
    saveConfig(config);
  }
}

function getBroadcastList() {
  return getConfig().broadcastList || [];
}

// Daily limit reset for all users
function resetAllUserDailyLimits() {
  const db = getUsers();
  const today = new Date().toISOString().split('T')[0];
  let changed = false;
  for (const userId of Object.keys(db.users)) {
    if (db.users[userId].lastReset !== today) {
      db.users[userId].usedToday = 0;
      db.users[userId].lastReset = today;
      changed = true;
    }
  }
  if (changed) saveUsers(db);
}

module.exports = {
  ensureDataDir,
  getUser,
  updateUser,
  getAllUsers,
  getUserProjects,
  addProject,
  removeProject,
  updateProject,
  findProjectByChatId,
  getAllProjects,
  getStats,
  saveStats,
  incrementReactions,
  resetDailyStats,
  resetAllUserDailyLimits,
  updateTotalUsers,
  updateTotalProjects,
  getConfig,
  saveConfig,
  addAdminChat,
  removeAdminChat,
  getAdminChats,
  addBroadcastUser,
  getBroadcastList,
};
