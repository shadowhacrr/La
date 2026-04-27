# 🤖 Telegram AutoReact Bot — Complete Deployment Guide

A premium, polling-based Telegram bot that auto-sends reactions to your channel/group posts. No webhooks, no database — pure JSON storage.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| ✅ 3-Step Verification | Telegram channel (auto-checked) + YouTube + WhatsApp |
| ➕ Add Projects | Add any channel/group via link or forward |
| 😀 Emoji Reactions | Choose from popular emojis or send custom |
| 🔥 Auto React | Bot auto-reacts to **every new post** instantly |
| 📊 Statistics | Daily limit tracking, usage stats |
| 💰 Recharge System | Users contact you for limit increases |
| ⚡ Admin Commands | `/addlimit`, `/broadcast`, `/stats` |
| 📢 Broadcast | Send messages to all users & all admin chats |
| 🗂️ JSON Database | No setup needed — everything stores in `.json` files |

---

## 📁 Project Structure

```
telegram-autoreact-bot/
├── data/
│   ├── users.json        # All user data & limits
│   ├── projects.json     # Channel/group projects
│   ├── stats.json        # Bot statistics
│   └── config.json       # Admin chats list
├── src/
│   ├── index.js          # Main bot logic
│   └── db.js             # JSON database helpers
├── package.json
├── .env.example
└── README.md
```

---

## 🚀 Step 1: Create Bot & Get Token

1. Open Telegram, search **@BotFather**
2. Send `/newbot`
3. Choose a name and username
4. Copy the **HTTP API Token**
5. Send `/setcommands` to BotFather and paste:
```
start - Start the bot
stats - Owner stats
```

---

## 🚀 Step 2: Get Your Owner User ID

1. Search **@userinfobot** in Telegram
2. Start it, it will reply with your numeric ID
3. Save this number — it's your `OWNER_ID`

---

## 🚀 Step 3: Setup Verification Channels

### Telegram Channel
1. Create a Telegram channel (public recommended)
2. Copy the username (e.g., `@mychannel`)
3. Add your bot as **admin** in this channel

### YouTube Channel
1. Copy your YouTube channel link
2. Example: `https://youtube.com/@mychannel`

### WhatsApp Channel
1. Create a WhatsApp channel
2. Copy the invite link
3. Example: `https://whatsapp.com/channel/002...`

---

## 🚀 Step 4: Configure Environment

Rename `.env.example` to `.env` and fill in your details:

```env
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
OWNER_ID=123456789
TELEGRAM_CHANNEL=@your_channel
YOUTUBE_CHANNEL=https://youtube.com/@yourchannel
WHATSAPP_CHANNEL=https://whatsapp.com/channel/yourlink
ADMIN_TELEGRAM=@your_username
ADMIN_WHATSAPP=+923001234567
DEFAULT_DAILY_LIMIT=200
```

---

## 🚀 Step 5: Local Testing

### Install Node.js
- Download from [nodejs.org](https://nodejs.org) (LTS version recommended)
- Verify: `node -v`

### Install Dependencies
```bash
cd telegram-autoreact-bot
npm install
```

### Run Bot
```bash
npm start
```

You should see:
```
✅ Bot is starting...
🤖 Bot started: @yourbot_username (ID: 1234567890)
```

---

## 🚀 Step 6: Deploy to Railway (Free Hosting)

### What is Railway?
Railway is a free cloud hosting platform perfect for Node.js bots.

### Steps:

**1. Create Railway Account**
- Go to [railway.app](https://railway.app)
- Sign up with GitHub

**2. Create New Project**
- Click **"New Project"**
- Choose **"Empty Project"**

**3. Add Code**
- Railway needs your code. You have 2 options:

#### Option A: Deploy from GitHub (Recommended)
```bash
# In your project folder
git init
git add .
git commit -m "Initial commit"
# Create a repo on GitHub and push
git remote add origin https://github.com/YOURNAME/telegram-autoreact-bot.git
git branch -M main
git push -u origin main
```
Then in Railway: **New → GitHub Repo → Select your repo**

#### Option B: Direct Upload
- In Railway, click **New → Upload Code**
- ZIP your project folder (without `node_modules`) and upload

**4. Set Environment Variables**
- In Railway dashboard, go to your service → **Variables**
- Add each variable from your `.env` file:
  - `BOT_TOKEN`
  - `OWNER_ID`
  - `TELEGRAM_CHANNEL`
  - etc.

**5. Start the Service**
- Railway will auto-detect `package.json` and run `npm start`
- Check **Deploy Logs** to see bot startup
- If you see `🤖 Bot started`, it's working!

**6. Keep Alive (Important!)**
Free Railway apps sleep after inactivity. For a bot, this is bad.

**Fix:** Railway doesn't sleep for workers that are always running (polling bots count as active!). If you face sleep issues, add a simple HTTP server:

Create `src/keepalive.js`:
```javascript
const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);
```

Then in `index.js` at the top, add:
```javascript
require('./keepalive');
```

This exposes a health-check URL so Railway knows it's active.

---

## 🚀 Step 7: Deploy to Render (Alternative Free Hosting)

### Steps:

**1. Create Render Account**
- [render.com](https://render.com) → Sign up with GitHub

**2. New Web Service**
- Click **"New +"** → **"Web Service"**
- Connect your GitHub repo

**3. Configure**
- **Name:** `telegram-autoreact-bot`
- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `node src/index.js`
- **Plan:** Free

**4. Environment Variables**
- Go to **Environment** tab
- Add all variables from `.env`

**5. Deploy**
- Click **Create Web Service**
- Done! Bot will auto-start

---

## 🚀 Step 8: Deploy to VPS (Best for Production)

If you have a Linux server (DigitalOcean, AWS, etc.):

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Clone or upload your bot
git clone https://github.com/YOURNAME/telegram-autoreact-bot.git
cd telegram-autoreact-bot

# 4. Install dependencies
npm install

# 5. Create .env file
nano .env
# (Paste your env variables, Ctrl+O, Enter, Ctrl+X)

# 6. Install PM2 (process manager)
npm install -g pm2

# 7. Start bot with PM2
pm2 start src/index.js --name autoreact-bot

# 8. Save PM2 config
pm2 save
pm2 startup

# 9. View logs
pm2 logs autoreact-bot

# 10. Restart / Stop / Status
pm2 restart autoreact-bot
pm2 stop autoreact-bot
pm2 status
```

---

## 👑 Owner Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `/addlimit` | `/addlimit user_id 500` | Increase user's daily limit |
| `/broadcast` | `/broadcast Hello everyone!` | Send message to all users |
| `/stats` | `/stats` | View full bot statistics |

**Admin Panel:**
- Tap **🔧 Admin Panel** in bot menu
- **📢 Broadcast Users** → send message to all bot users
- **📡 Broadcast Groups** → send message to all channels/groups where bot is admin
- **⚡ Add Limit** → add limit via inline interface
- **📈 Bot Stats** → view statistics

---

## ⚠️ Important Notes

### Bot Must Be Admin
For the bot to react to posts in your channel/group:
1. Go to channel/group settings
2. Add Administrators
3. Search your bot's username
4. Enable **Post Messages** and **Edit Messages**

### Public vs Private Channels
- **Public:** Send link like `https://t.me/mychannel`
- **Private:** Forward any message from the channel to the bot

### Daily Limit Reset
- Limits reset every day at midnight (UTC)
- Checked automatically every minute

### Reactions Per Post
- The bot sends **1 reaction per post** (Telegram Bot API limit)
- The daily limit controls how many **total posts** the bot reacts to per day

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot doesn't start | Check `BOT_TOKEN` is correct |
| Verification fails | Make sure your verification channel is PUBLIC |
| "I'm not an admin" | Add bot as admin with Post Messages permission |
| Private channel not working | Forward a message instead of sending link |
| Bot not reacting | Ensure project is 🟢 Active and daily limit not exceeded |
| Broadcast fails | Some users may have blocked the bot (this is normal) |

---

## 💡 Pro Tips

1. **Test locally first** before deploying to cloud
2. **Use PM2** on VPS for automatic restarts if bot crashes
3. **Monitor logs** with `pm2 logs` or Railway/Render dashboard
4. **Backup `data/` folder** regularly — it contains all your JSON data
5. **Don't expose `.env`** — never commit it to GitHub (use `.gitignore`)

---

## 📞 Support

If you need help:
- Contact admin via Telegram: `ADMIN_TELEGRAM` from `.env`
- Or WhatsApp: `ADMIN_WHATSAPP` from `.env`

---

**🎉 Your bot is ready! Enjoy your auto-reactions!**
