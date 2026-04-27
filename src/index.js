require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

const {
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
  incrementReactions,
  resetDailyStats,
  resetAllUserDailyLimits,
  updateTotalUsers,
  updateTotalProjects,
  addAdminChat,
  removeAdminChat,
  getAdminChats,
  addBroadcastUser,
  getBroadcastList,
} = require('./db');

// ================= CONFIG =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = parseInt(process.env.OWNER_ID);
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL;
const YOUTUBE_CHANNEL = process.env.YOUTUBE_CHANNEL;
const WHATSAPP_CHANNEL = process.env.WHATSAPP_CHANNEL;
const ADMIN_TELEGRAM = process.env.ADMIN_TELEGRAM;
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing in .env file');
  process.exit(1);
}

// ================= INIT =================
ensureDataDir();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let BOT_ID = null;

(async () => {
  try {
    const me = await bot.getMe();
    BOT_ID = me.id;
    console.log(`🤖 Bot started: @${me.username} (ID: ${me.id})`);
  } catch (err) {
    console.error('❌ Failed to get bot info:', err.message);
  }
})();

// ================= STATE =================
const userStates = {}; // { userId: { action: 'add_project_step1', data: {} } }
const ownerStates = {}; // { ownerId: { action: 'broadcast', target: 'users' } }

function setState(userId, action, data = {}) {
  userStates[userId] = { action, data, time: Date.now() };
}
function clearState(userId) {
  delete userStates[userId];
}
function getState(userId) {
  return userStates[userId] || null;
}

// ================= EMOJIS =================
const POPULAR_EMOJIS = ['👍', '❤️', '🔥', '🥰', '👏', '😁', '🤩', '🎉', '🙏', '💯', '😍', '🥳', '✨', '⚡', '🫡'];

// ================= HELPERS =================
function isOwner(userId) {
  return userId === OWNER_ID;
}

function escapeMarkdown(text) {
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function mainKeyboard(userId) {
  const isAdmin = isOwner(userId);
  const keyboard = [
    [{ text: '➕ Add Project', callback_data: 'add_project' }, { text: '📁 My Projects', callback_data: 'my_projects' }],
    [{ text: '📊 Statistics', callback_data: 'statistics' }, { text: '💰 Recharge', callback_data: 'recharge' }],
    [{ text: '❓ How to Use', callback_data: 'how_to_use' }],
  ];
  if (isAdmin) {
    keyboard.push(
      [{ text: '🔧 Admin Panel', callback_data: 'admin_panel' }]
    );
  }
  return { inline_keyboard: keyboard };
}

function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📢 Broadcast Users', callback_data: 'broadcast_users' }, { text: '📡 Broadcast Groups', callback_data: 'broadcast_groups' }],
      [{ text: '⚡ Add Limit', callback_data: 'add_limit' }, { text: '📈 Bot Stats', callback_data: 'bot_stats' }],
      [{ text: '🔙 Back to Menu', callback_data: 'main_menu' }],
    ],
  };
}

function emojiKeyboard() {
  const rows = [];
  const perRow = 5;
  for (let i = 0; i < POPULAR_EMOJIS.length; i += perRow) {
    rows.push(
      POPULAR_EMOJIS.slice(i, i + perRow).map(e => ({ text: e, callback_data: `emoji_${e}` }))
    );
  }
  rows.push([{ text: '✏️ Custom Emoji', callback_data: 'emoji_custom' }]);
  rows.push([{ text: '❌ Cancel', callback_data: 'cancel_project' }]);
  return { inline_keyboard: rows };
}

function projectActionsKeyboard(projectId) {
  return {
    inline_keyboard: [
      [
        { text: '🛑 Deactivate', callback_data: `deactivate_${projectId}` },
        { text: '❌ Delete', callback_data: `delete_${projectId}` },
      ],
      [{ text: '🔙 Back', callback_data: 'my_projects' }],
    ],
  };
}

function verificationKeyboard(step) {
  const buttons = [];
  if (step === 1) {
    buttons.push([{ text: '📢 Join Telegram Channel', url: TELEGRAM_CHANNEL?.startsWith('http') ? TELEGRAM_CHANNEL : `https://t.me/${TELEGRAM_CHANNEL.replace('@', '')}` }]);
    buttons.push([{ text: '✅ Verify Join', callback_data: 'verify_telegram' }]);
  } else if (step === 2) {
    buttons.push([{ text: '🎬 Subscribe YouTube', url: YOUTUBE_CHANNEL }]);
    buttons.push([{ text: '✅ Subscribed', callback_data: 'verify_youtube' }]);
  } else if (step === 3) {
    buttons.push([{ text: '💬 Join WhatsApp', url: WHATSAPP_CHANNEL }]);
    buttons.push([{ text: '✅ Joined WhatsApp', callback_data: 'verify_whatsapp' }]);
  }
  return { inline_keyboard: buttons };
}

// ================= REACTION API =================
async function sendReaction(chatId, messageId, emoji) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setMessageReaction`, {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji }],
      is_big: false,
    });
    return true;
  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    console.error(`❌ Reaction failed for ${chatId}/${messageId}:`, msg);
    return false;
  }
}

// ================= VERIFICATION =================
async function checkVerification(chatId, userId) {
  const user = getUser(userId);

  // Check if all verified
  if (user.verified.telegram && user.verified.youtube && user.verified.whatsapp) {
    await bot.sendMessage(chatId,
      `🎉 *Welcome to AutoReact Bot!*\n\n` +
      `✅ You are fully verified and ready to use the bot.\n\n` +
      `📌 *Features:*\n` +
      `• Add your channels/groups\n` +
      `• Select reaction emoji\n` +
      `• Auto reacts to all new posts\n` +
      `• Daily limit tracking\n\n` +
      `🚀 Tap below to get started!`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }

  // Telegram verification
  if (!user.verified.telegram) {
    await bot.sendMessage(chatId,
      `🔐 *Step 1: Telegram Channel Verification*\n\n` +
      `Please join our official Telegram channel to continue.\n\n` +
      `⬇️ Click below to join, then press *Verify*.`,
      { parse_mode: 'Markdown', reply_markup: verificationKeyboard(1) }
    );
    return;
  }

  // YouTube verification
  if (!user.verified.youtube) {
    await bot.sendMessage(chatId,
      `🔐 *Step 2: YouTube Verification*\n\n` +
      `Please subscribe to our YouTube channel.\n\n` +
      `⬇️ Click below to subscribe, then press *Subscribed*.`,
      { parse_mode: 'Markdown', reply_markup: verificationKeyboard(2) }
    );
    return;
  }

  // WhatsApp verification
  if (!user.verified.whatsapp) {
    await bot.sendMessage(chatId,
      `🔐 *Step 3: WhatsApp Verification*\n\n` +
      `Please join our WhatsApp channel.\n\n` +
      `⬇️ Click below to join, then press *Joined*.`,
      { parse_mode: 'Markdown', reply_markup: verificationKeyboard(3) }
    );
    return;
  }
}

// ================= COMMANDS =================
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name || 'User';

  resetAllUserDailyLimits();
  let user = getUser(userId);
  if (!user.username) {
    updateUser(userId, { username });
    updateTotalUsers();
  }
  addBroadcastUser(userId);
  clearState(userId);

  if (user.verified.telegram && user.verified.youtube && user.verified.whatsapp) {
    await bot.sendMessage(chatId,
      `👋 *Welcome back, ${escapeMarkdown(username)}!*\n\n` +
      `Use the buttons below to manage your projects.`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
  } else {
    await checkVerification(chatId, userId);
  }
});

bot.onText(/\/addlimit\s+(\d+)\s+(\d+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isOwner(userId)) {
    await bot.sendMessage(msg.chat.id, '⛔ You are not authorized.');
    return;
  }
  const targetId = parseInt(match[1]);
  const newLimit = parseInt(match[2]);
  updateUser(targetId, { dailyLimit: newLimit });
  await bot.sendMessage(msg.chat.id,
    `✅ *Limit Updated*\n\n` +
    `👤 User ID: \`${targetId}\`\n` +
    `⚡ New Daily Limit: *${newLimit}*`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/broadcast\s+(.+)/s, async (msg, match) => {
  const userId = msg.from.id;
  if (!isOwner(userId)) return;
  const message = match[1];
  const users = getAllUsers();
  let sent = 0;
  let failed = 0;

  for (const u of users) {
    try {
      await bot.sendMessage(u.id, `📢 *Broadcast Message*\n\n${escapeMarkdown(message)}`, { parse_mode: 'Markdown' });
      sent++;
    } catch {
      failed++;
    }
  }

  await bot.sendMessage(msg.chat.id,
    `✅ Broadcast Complete\n\n` +
    `📤 Sent: ${sent}\n` +
    `❌ Failed: ${failed}`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/stats/, async (msg) => {
  const userId = msg.from.id;
  if (!isOwner(userId)) return;
  const stats = getStats();
  const users = getAllUsers();
  const projects = getAllProjects();
  const today = new Date().toISOString().split('T')[0];

  await bot.sendMessage(msg.chat.id,
    `📈 *Bot Statistics*\n\n` +
    `👥 Total Users: *${users.length}*\n` +
    `📁 Total Projects: *${projects.length}*\n` +
    `🔥 Total Reactions: *${stats.totalReactions || 0}*\n` +
    `📊 Today Reactions: *${stats.todayReactions || 0}*\n` +
    `📅 Today Date: \`${today}\``, 
    { parse_mode: 'Markdown' }
  );
});

// ================= CALLBACK QUERIES =================
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  // Owner states
  if (isOwner(userId) && ownerStates[userId]) {
    const state = ownerStates[userId];
    if (state.action === 'broadcast_target') {
      if (data === 'broadcast_users') {
        ownerStates[userId] = { action: 'broadcast_users' };
        await bot.editMessageText('📢 *Broadcast to Users*\n\nPlease send the message you want to broadcast to all bot users.',
          { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_panel' }]] } }
        );
        return;
      }
      if (data === 'broadcast_groups') {
        ownerStates[userId] = { action: 'broadcast_groups' };
        await bot.editMessageText('📡 *Broadcast to Groups/Channels*\n\nPlease send the message you want to broadcast to all admin chats.',
          { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_panel' }]] } }
        );
        return;
      }
    }
  }

  // Verification callbacks
  if (data === 'verify_telegram') {
    try {
      let channelUsername = TELEGRAM_CHANNEL;
      if (!channelUsername) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Verification channel not configured.', show_alert: true });
        return;
      }
      // Extract username from URL if provided
      const urlMatch = channelUsername.match(/t\.me\/(\+?[a-zA-Z0-9_]+)/);
      if (urlMatch) {
        channelUsername = urlMatch[1];
      }
      if (!channelUsername.startsWith('@')) {
        channelUsername = `@${channelUsername}`;
      }
      const member = await bot.getChatMember(channelUsername, userId);
      if (['member', 'administrator', 'creator'].includes(member.status)) {
        updateUser(userId, { verified: { ...getUser(userId).verified, telegram: true } });
        await bot.editMessageText('✅ *Telegram verified!*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        await checkVerification(chatId, userId);
      } else {
        await bot.answerCallbackQuery(query.id, { text: '❌ You have not joined the channel yet!', show_alert: true });
      }
    } catch (err) {
      console.error('Telegram verify error:', err.message);
      await bot.answerCallbackQuery(query.id, { text: '❌ Error verifying. Make sure the channel is public and you joined.', show_alert: true });
    }
    return;
  }

  if (data === 'verify_youtube') {
    updateUser(userId, { verified: { ...getUser(userId).verified, youtube: true } });
    await bot.editMessageText('✅ *YouTube verified!*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
    await checkVerification(chatId, userId);
    return;
  }

  if (data === 'verify_whatsapp') {
    updateUser(userId, { verified: { ...getUser(userId).verified, whatsapp: true } });
    await bot.editMessageText('✅ *WhatsApp verified!*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
    await checkVerification(chatId, userId);
    return;
  }

  // Main menu
  if (data === 'main_menu') {
    clearState(userId);
    if (ownerStates[userId]) delete ownerStates[userId];
    const user = getUser(userId);
    await bot.editMessageText(
      `👋 *Welcome to AutoReact Bot!*\n\n` +
      `📊 Daily Limit: *${user.dailyLimit}*\n` +
      `🔥 Used Today: *${user.usedToday}*\n` +
      `💎 Credits: *${user.credits}*\n` +
      `📁 Active Projects: *${getUserProjects(userId).filter(p => p.status === 'active').length}*`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }

  if (data === 'add_project') {
    setState(userId, 'awaiting_channel', {});
    await bot.editMessageText(
      `➕ *Add New Project*\n\n` +
      `Please send your *public channel/group link* (e.g., \`https://t.me/mychannel\`)\n\n` +
      `OR forward any message from your *private channel/group* to me.\n\n` +
      `⚠️ I must be an *admin* in your channel/group to send reactions.`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'main_menu' }]] } }
    );
    return;
  }

  if (data === 'my_projects') {
    const projects = getUserProjects(userId);
    if (projects.length === 0) {
      await bot.editMessageText('📁 *My Projects*\n\nYou have no projects yet. Tap ➕ Add Project to create one.',
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
      );
      return;
    }
    let text = '📁 *Your Projects*\n\n';
    const keyboard = [];
    projects.forEach((p, idx) => {
      const status = p.status === 'active' ? '🟢 Active' : '🔴 Inactive';
      text += `${idx + 1}. ${escapeMarkdown(p.name || p.link)}\n   Emoji: ${p.emoji} | ${status}\n\n`;
      keyboard.push([{ text: `${p.emoji} ${p.name || p.link}`, callback_data: `project_${p.id}` }]);
    });
    keyboard.push([{ text: '🔙 Back', callback_data: 'main_menu' }]);
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    return;
  }

  if (data.startsWith('project_')) {
    const projectId = data.replace('project_', '');
    const projects = getUserProjects(userId);
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    await bot.editMessageText(
      `📋 *Project Details*\n\n` +
      `🔗 Link: \`${escapeMarkdown(project.link)}\`\n` +
      `😀 Emoji: ${project.emoji}\n` +
      `📌 Status: ${project.status === 'active' ? '🟢 Active' : '🔴 Inactive'}\n` +
      `📅 Created: ${project.createdAt.split('T')[0]}`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: projectActionsKeyboard(projectId) }
    );
    return;
  }

  if (data.startsWith('deactivate_')) {
    const projectId = data.replace('deactivate_', '');
    const projects = getUserProjects(userId);
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const newStatus = project.status === 'active' ? 'inactive' : 'active';
    updateProject(userId, projectId, { status: newStatus });
    await bot.editMessageText(
      `✅ Project status updated to *${newStatus.toUpperCase()}*`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: projectActionsKeyboard(projectId) }
    );
    return;
  }

  if (data.startsWith('delete_')) {
    const projectId = data.replace('delete_', '');
    removeProject(userId, projectId);
    updateTotalProjects();
    await bot.editMessageText('❌ Project deleted successfully.', 
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 My Projects', callback_data: 'my_projects' }]] } }
    );
    return;
  }

  if (data === 'statistics') {
    const user = getUser(userId);
    const projects = getUserProjects(userId);
    const activeProjects = projects.filter(p => p.status === 'active');
    await bot.editMessageText(
      `📊 *Your Statistics*\n\n` +
      `👤 User ID: \`${userId}\`\n` +
      `📊 Daily Limit: *${user.dailyLimit}*\n` +
      `🔥 Used Today: *${user.usedToday}*\n` +
      `💎 Credits: *${user.credits}*\n` +
      `📁 Total Projects: *${projects.length}*\n` +
      `🟢 Active: *${activeProjects.length}*\n` +
      `📅 Joined: ${user.joinedAt.split('T')[0]}`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }

  if (data === 'recharge') {
    await bot.editMessageText(
      `💰 *Recharge Credits*\n\n` +
      `To increase your daily reaction limit, please contact the admin and make payment.\n\n` +
      `📱 *Telegram:* ${ADMIN_TELEGRAM ? escapeMarkdown(ADMIN_TELEGRAM) : 'N/A'}\n` +
      `📞 *WhatsApp:* \`${ADMIN_WHATSAPP || 'N/A'}\`\n\n` +
      `After payment, admin will run:\n` +
      `\`/addlimit your_id new_limit\``,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }

  if (data === 'how_to_use') {
    await bot.editMessageText(
      `❓ *How to Use AutoReact Bot*\n\n` +
      `1️⃣ Add me as *admin* in your channel/group\n` +
      `   (with "Post Messages" permission)\n\n` +
      `2️⃣ Click ➕ *Add Project* and send your channel link\n\n` +
      `3️⃣ Select your favorite *emoji* for reactions\n\n` +
      `4️⃣ Done! I will *auto-react* to every new post\n\n` +
      `⚡ Your daily limit resets every day at midnight.\n` +
      `💰 Contact admin to increase your limit.`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }

  if (data === 'admin_panel') {
    await bot.editMessageText(
      `🔧 *Admin Panel*\n\n` +
      `Select an option below:`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
    return;
  }

  if (data === 'broadcast_users' || data === 'broadcast_groups') {
    ownerStates[userId] = { action: 'broadcast_target' };
    await bot.editMessageText(
      'Select broadcast target:',
      { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [
        [{ text: '👥 All Bot Users', callback_data: 'broadcast_users' }],
        [{ text: '📡 All Admin Chats', callback_data: 'broadcast_groups' }],
        [{ text: '🔙 Back', callback_data: 'admin_panel' }],
      ] } }
    );
    return;
  }

  if (data === 'bot_stats') {
    const stats = getStats();
    const users = getAllUsers();
    const projects = getAllProjects();
    await bot.editMessageText(
      `📈 *Bot Statistics*\n\n` +
      `👥 Total Users: *${users.length}*\n` +
      `📁 Total Projects: *${projects.length}*\n` +
      `🔥 Total Reactions: *${stats.totalReactions || 0}*\n` +
      `📊 Today Reactions: *${stats.todayReactions || 0}*\n` +
      `📅 Today: \`${stats.todayResetDate || new Date().toISOString().split('T')[0]}\``,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
    return;
  }

  if (data === 'add_limit') {
    ownerStates[userId] = { action: 'add_limit' };
    await bot.editMessageText(
      `⚡ *Add Limit*\n\n` +
      `Please send in format:\n` +
      `\`user_id new_limit\`\n\n` +
      `Example: \`123456789 500\``,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_panel' }]] } }
    );
    return;
  }

  // Emoji selection
  if (data.startsWith('emoji_')) {
    const state = getState(userId);
    if (!state || state.action !== 'awaiting_emoji') return;

    const emoji = data.replace('emoji_', '');
    if (emoji === 'custom') {
      setState(userId, 'awaiting_custom_emoji', state.data);
      await bot.editMessageText(
        `✏️ *Custom Emoji*\n\n` +
        `Please send a single emoji character you want to use.\n\n` +
        `Examples: 🐶 🎵 🌟 🍎`,
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_project' }]] } }
      );
      return;
    }

    // Save project
    const projectData = state.data;
    const project = {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: projectData.name || projectData.link,
      link: projectData.link,
      chatId: projectData.chatId,
      emoji: emoji,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    addProject(userId, project);
    updateTotalProjects();
    clearState(userId);

    await bot.editMessageText(
      `✅ *Project Created!*\n\n` +
      `🔗 ${escapeMarkdown(project.link)}\n` +
      `😀 Reaction: ${emoji}\n` +
      `📌 Status: 🟢 Active\n\n` +
      `I will now auto-react to all new posts in this channel/group!`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }

  if (data === 'cancel_project') {
    clearState(userId);
    await bot.editMessageText('❌ Project creation cancelled.', 
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }
});

// ================= MESSAGE HANDLER =================
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Skip commands
  if (msg.text && msg.text.startsWith('/')) return;

  // Only process bot states in private chat
  const isPrivate = msg.chat.type === 'private';
  const state = isPrivate ? getState(userId) : null;

  // Handle custom emoji
  if (state && state.action === 'awaiting_custom_emoji') {
    const emoji = msg.text?.trim();
    if (!emoji || emoji.length > 2) {
      await bot.sendMessage(chatId, '❌ Please send a valid single emoji.', { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_project' }]] } });
      return;
    }
    const projectData = state.data;
    const project = {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: projectData.name || projectData.link,
      link: projectData.link,
      chatId: projectData.chatId,
      emoji: emoji,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    addProject(userId, project);
    updateTotalProjects();
    clearState(userId);
    await bot.sendMessage(chatId,
      `✅ *Project Created!*\n\n` +
      `🔗 ${escapeMarkdown(project.link)}\n` +
      `😀 Reaction: ${emoji}\n` +
      `📌 Status: 🟢 Active\n\n` +
      `I will now auto-react to all new posts in this channel/group!`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard(userId) }
    );
    return;
  }

  // Handle add limit admin input
  if (isPrivate && isOwner(userId) && ownerStates[userId]?.action === 'add_limit') {
    const parts = msg.text.trim().split(/\s+/);
    if (parts.length !== 2) {
      await bot.sendMessage(chatId, '❌ Invalid format. Use: `user_id new_limit`', { parse_mode: 'Markdown' });
      return;
    }
    const targetId = parseInt(parts[0]);
    const newLimit = parseInt(parts[1]);
    if (isNaN(targetId) || isNaN(newLimit)) {
      await bot.sendMessage(chatId, '❌ Both values must be numbers.');
      return;
    }
    updateUser(targetId, { dailyLimit: newLimit });
    delete ownerStates[userId];
    await bot.sendMessage(chatId,
      `✅ *Limit Updated*\n\n` +
      `👤 User: \`${targetId}\`\n` +
      `⚡ New Daily Limit: *${newLimit}*`,
      { parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
    return;
  }

  // Handle broadcast from owner
  if (isPrivate && isOwner(userId) && ownerStates[userId]?.action === 'broadcast_users') {
    const message = msg.text || (msg.caption ? msg.caption : '');
    if (!message && !msg.photo && !msg.video) {
      await bot.sendMessage(chatId, '❌ Please send a text, photo, or video message to broadcast.');
      return;
    }
    const users = getAllUsers();
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      try {
        if (msg.photo) {
          await bot.sendPhoto(u.id, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption || '' });
        } else if (msg.video) {
          await bot.sendVideo(u.id, msg.video.file_id, { caption: msg.caption || '' });
        } else {
          await bot.sendMessage(u.id, message, { parse_mode: 'Markdown' });
        }
        sent++;
      } catch {
        failed++;
      }
    }
    delete ownerStates[userId];
    await bot.sendMessage(chatId,
      `✅ Broadcast Complete\n\n` +
      `👥 Target: Bot Users\n` +
      `📤 Sent: ${sent}\n` +
      `❌ Failed: ${failed}`,
      { parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
    return;
  }

  if (isPrivate && isOwner(userId) && ownerStates[userId]?.action === 'broadcast_groups') {
    const message = msg.text || (msg.caption ? msg.caption : '');
    const chats = getAdminChats();
    let sent = 0;
    let failed = 0;
    for (const chatId of chats) {
      try {
        if (msg.photo) {
          await bot.sendPhoto(chatId, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption || '' });
        } else if (msg.video) {
          await bot.sendVideo(chatId, msg.video.file_id, { caption: msg.caption || '' });
        } else {
          await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        }
        sent++;
      } catch {
        failed++;
      }
    }
    delete ownerStates[userId];
    await bot.sendMessage(chatId,
      `✅ Broadcast Complete\n\n` +
      `📡 Target: Admin Chats\n` +
      `📤 Sent: ${sent}\n` +
      `❌ Failed: ${failed}`,
      { parse_mode: 'Markdown', reply_markup: adminKeyboard() }
    );
    return;
  }

  // Handle awaiting channel link / forward
  if (state && state.action === 'awaiting_channel') {
    let chatIdTarget = null;
    let link = '';
    let name = '';

    // Forwarded message
    if (msg.forward_from_chat) {
      chatIdTarget = msg.forward_from_chat.id;
      link = msg.forward_from_chat.username ? `https://t.me/${msg.forward_from_chat.username}` : `Private (${chatIdTarget})`;
      name = msg.forward_from_chat.title || 'Forwarded Chat';
    }
    // Link provided
    else if (msg.text) {
      const text = msg.text.trim();
      const match = text.match(/t\.me\/(\+?[a-zA-Z0-9_]+)/) || text.match(/@([a-zA-Z0-9_]+)/);
      if (!match) {
        await bot.sendMessage(chatId, '❌ Invalid link. Please send a valid Telegram link like `https://t.me/mychannel`', { parse_mode: 'Markdown' });
        return;
      }
      const username = match[1];
      // Private channel links (t.me/+xxxx) cannot be accessed via getChat
      if (username.startsWith('+')) {
        await bot.sendMessage(chatId,
          `❌ Private channel/group links (\`t.me/+...\`) cannot be used directly.\n\n` +
          `💡 *Please forward any message from your private channel/group to me.*`,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_project' }]] } }
        );
        return;
      }
      try {
        const chat = await bot.getChat(`@${username}`);
        chatIdTarget = chat.id;
        link = chat.username ? `https://t.me/${chat.username}` : text;
        name = chat.title || username;
      } catch (err) {
        console.error('getChat error:', err.message);
        await bot.sendMessage(chatId,
          `❌ I cannot access this chat. Possible reasons:\n` +
          `• I'm not an admin in this channel/group\n` +
          `• The link is incorrect\n` +
          `• It's a private chat\n\n` +
          `💡 *Tip:* Forward a message from your channel instead, or add me as admin first.`,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_project' }]] } }
        );
        return;
      }
    }

    if (!chatIdTarget) {
      await bot.sendMessage(chatId, '❌ Could not determine the channel/group. Please forward a message or send a valid public link.');
      return;
    }

    // Check if bot is admin
    try {
      const member = await bot.getChatMember(chatIdTarget, BOT_ID);
      if (member.status !== 'administrator') {
        await bot.sendMessage(chatId,
          `❌ *I'm not an admin* in this channel/group.\n\n` +
          `Please add me as an administrator with these permissions:\n` +
          `• Post Messages\n` +
          `• Edit Messages\n\n` +
          `After adding me, try again.`,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_project' }]] } }
        );
        return;
      }
    } catch (err) {
      console.error('Admin check error:', err.message);
      await bot.sendMessage(chatId,
        `❌ Failed to check admin status.\n` +
        `Please make sure I am added as admin in this chat.`,
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel_project' }]] } }
      );
      return;
    }

    // Check duplicate
    const existing = getUserProjects(userId).find(p => p.chatId === chatIdTarget);
    if (existing) {
      await bot.sendMessage(chatId, '⚠️ This channel/group is already in your projects.', { reply_markup: mainKeyboard(userId) });
      clearState(userId);
      return;
    }

    // Save to state and ask emoji
    setState(userId, 'awaiting_emoji', { chatId: chatIdTarget, link, name });
    await bot.sendMessage(chatId,
      `✅ *Channel Verified!*\n\n` +
      `📌 ${escapeMarkdown(name)}\n` +
      `🔗 ${escapeMarkdown(link)}\n\n` +
      `Now select a reaction emoji:`,
      { parse_mode: 'Markdown', reply_markup: emojiKeyboard() }
    );
    return;
  }

  // Handle group/channel messages for auto-reactions (supergroups & groups)
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    handleAutoReact(msg.chat.id, msg.message_id);
  }
});

// ================= CHANNEL POST HANDLER =================
bot.on('channel_post', async (msg) => {
  await handleAutoReact(msg.chat.id, msg.message_id);
});

// ================= AUTO REACT CORE =================
async function handleAutoReact(chatId, messageId) {
  const found = findProjectByChatId(chatId);
  if (!found) return;

  const { userId, project } = found;
  if (project.status !== 'active') return;

  const user = getUser(userId);
  if (user.banned) return;

  // Owner bypasses limits
  const isAdmin = isOwner(userId);
  if (!isAdmin) {
    // Check reset
    const today = new Date().toISOString().split('T')[0];
    if (user.lastReset !== today) {
      user.usedToday = 0;
      user.lastReset = today;
      updateUser(userId, { usedToday: 0, lastReset: today });
    }
    if (user.usedToday >= user.dailyLimit) return;
  }

  const success = await sendReaction(chatId, messageId, project.emoji);
  if (success) {
    if (!isAdmin) {
      updateUser(userId, { usedToday: user.usedToday + 1 });
    }
    incrementReactions(1);
    console.log(`🔥 Reacted to ${chatId}/${messageId} with ${project.emoji} (User: ${userId})`);
  }
}

// ================= MY CHAT MEMBER (Track admin chats) =================
bot.on('my_chat_member', async (msg) => {
  const chat = msg.chat;
  const newStatus = msg.new_chat_member?.status;
  const oldStatus = msg.old_chat_member?.status;

  if (chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') {
    if (newStatus === 'administrator') {
      addAdminChat(chat.id);
      console.log(`✅ Added admin chat: ${chat.id} (${chat.title || chat.username})`);
    } else if (oldStatus === 'administrator' && (newStatus === 'left' || newStatus === 'kicked' || newStatus === 'member')) {
      removeAdminChat(chat.id);
      console.log(`❌ Removed admin chat: ${chat.id}`);
    }
  }
});

// ================= CRON: DAILY RESET =================
setInterval(() => {
  resetDailyStats();
  resetAllUserDailyLimits();
}, 60 * 1000); // Check every minute

// ================= KEEPALIVE SERVER (for Railway/Render) =================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AutoReact Bot is running!');
}).listen(PORT, () => {
  console.log(`🌐 Health check server on port ${PORT}`);
});

// ================= ERROR HANDLING =================
bot.on('polling_error', (err) => {
  console.error('⚠️ Polling error:', err.message || err);
});

bot.on('error', (err) => {
  console.error('⚠️ Bot error:', err.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

console.log('✅ Bot is starting...');