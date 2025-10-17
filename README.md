# ChatMaster 

A modern, full-stack real-time chat application with voice/video calling capabilities, built with React, Node.js, Socket.io, and MongoDB.

**Live Demo:** [https://chatmaster-app.vercel.app](https://chatmaster-app.vercel.app)

## Features

- **Real-time Messaging** - Instant message delivery with Socket.io
- **Friend System** - Add friends using unique 8-digit Friend IDs
- **Group Chats** - Create and manage group conversations
- **Voice & Video Calls** - WebRTC-powered calling with screen sharing
- **File Sharing** - Share images, videos, and documents
- **Message Reactions** - React to messages with emojis
- **Typing Indicators** - See when someone is typing
- **Read Receipts** - Track message delivery and read status
- **Online Status** - Real-time presence indicators
- **Dark/Light Theme** - Customizable UI themes
- **Responsive Design** - Works seamlessly on desktop and mobile

##  Tech Stack

### Frontend
- React.js
- Socket.io-client
- Tailwind CSS
- Axios
- React Router
- React Hot Toast

### Backend
- Node.js
- Express.js
- Socket.io
- MongoDB (Mongoose)
- JWT Authentication
- Bcrypt
- Cloudinary (File uploads)

### Deployment
- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas
- Storage: Cloudinary

##  Quick Start

### Prerequisites
- Node.js (v18 or higher)
- MongoDB Atlas account
- Git

### Installation

1. **Clone the repository**
git clone https://github.com/aravinditte/chatmaster-app.git
cd chatmaster-app

2. **Install dependencies**
npm run install:all

3. **Configure environment variables**

Create `server/.env`:
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
PORT=5000
CLIENT_URL=http://localhost:3000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

Create `client/.env`:
REACT_APP_API_URL=http://localhost:5000
REACT_APP_SOCKET_URL=http://localhost:5000

4. **Run the application**
npm run dev

- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## License

This project is open source and available under the [MIT License](LICENSE).


##  Acknowledgments

- Socket.io for real-time communication
- MongoDB for database
- Vercel & Render for hosting
- Cloudinary for file storage

## Contact

For questions or support, please open an issue or contact:
- Email: aravinditte0121@gmail.com
- GitHub: [@aravinditte](https://github.com/aravinditte)

## Links

- **Live App:** https://chatmaster-app.vercel.app
- **Backend API:** https://chatmaster-app.onrender.com
- **Documentation:** [View Docs](docs/)

**Made with ❤️ by Itte Aravind**