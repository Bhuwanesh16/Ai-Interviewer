# AI Interviewer - Industrial Standard Edge-AI Platform

A professional, privacy-focused AI interview preparation platform that uses edge-based machine learning to provide real-time feedback and comprehensive analysis.

## 🚀 Features

- **Real-time Edge Analysis**: Facial and speech analysis performed locally for privacy and speed.
- **LLM-Powered Questions**: Dynamic question generation tailored to specific roles and experience levels.
- **Comprehensive Reporting**: Detailed feedback on facial expressions, speech patterns, and answer relevance.
- **Secure Architecture**: Industrial-standard security headers, token-based authentication, and structured error handling.
- **Professional UI**: Modern, responsive interface with robust error boundaries and consistent state management.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, TailwindCSS, Framer Motion, Axios.
- **Backend**: Flask, SQLAlchemy, SQLite, JWT (ItsDangerous), Rotating Logging.
- **AI/ML**: MediaPipe (Vision), OpenAI Whisper (Speech), LLaMA3/Ollama (LLM), Transformers.

## 📦 Getting Started

### Backend Setup

1. Navigate to `edge-ai-interviewer/backend`
2. Create a virtual environment: `python -m venv venv`
3. Activate environment: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Linux/Mac)
4. Install dependencies: `pip install -r requirements.txt`
5. Set environment variables in a `.env` file:
   ```env
   FLASK_ENV=development
   SECRET_KEY=your_secret_key
   JWT_SECRET_KEY=your_jwt_key
   DATABASE_URL=sqlite:///edge_ai_interviewer.db
   ```
6. Run the server: `python app.py`

### Frontend Setup

1. Navigate to `edge-ai-interviewer/frontend`
2. Install dependencies: `npm install`
3. Set environment variables in `.env`:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```
4. Start development server: `npm run dev`

## 🛡️ Security & Standards

- **Logging**: Rotating file logs for production monitoring.
- **Error Handling**: Global error handlers to prevent internal data leaks.
- **Auth**: Secure token-based authentication with auto-expiration handling.
- **Headers**: CSP, HSTS, and X-Frame-Options enabled for browser security.

## 📄 License

MIT License