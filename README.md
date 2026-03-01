# FitTrackr 🏋️

A full-stack personal fitness tracking dashboard with real-time data visualization.

## Features
- 📊 Dashboard with live stats and charts
- 👣 Step tracking via Google Fit API
- 🔥 Calorie tracking via Google Fit API  
- 💧 Water intake tracker
- ❤️ Heart rate monitor
- ⚡ Smart Workout Planner (rule-based AI engine)
- 🍎 Food Scanner (USDA nutrition database)
- 📈 Weekly Fitness Report Card with PDF export
- 🌙 Dark/Light mode

## Tech Stack
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **APIs:** Google Fit (OAuth 2.0), USDA FoodData Central

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/fittrackr.git
cd fittrackr
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create `.env` file
Create a `.env` file in the root folder with:
```
CLIENT_ID=your_google_client_id
SECRET=your_google_client_secret
REDIRECT_URI=http://localhost:3000/oauth2callback
FRONTEND_URL=http://localhost:5500
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=fitness_app
USDA_API_KEY=your_usda_api_key
```

### 4. Set up MySQL database
Create a database called `fitness_app` in MySQL.

### 5. Start the server
```bash
npm start
```

### 6. Open the app
Open `index.html` with Live Server in VS Code.
