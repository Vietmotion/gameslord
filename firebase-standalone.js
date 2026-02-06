// Firebase standalone API for games
// Include this in games to enable score saving without the hub

const firebaseConfig = {
    apiKey: "AIzaSyDI4oTgZDCuKGBrTzlbOcxRNz4mQLvSH_8",
    authDomain: "gameslord-f3fd4.firebaseapp.com",
    projectId: "gameslord-f3fd4",
    storageBucket: "gameslord-f3fd4.firebasestorage.app",
    messagingSenderId: "637214003741",
    appId: "1:637214003741:web:be6e6633b1bac24b102cf4",
    measurementId: "G-ZJGJLDT7M9"
};

let db = null;
let auth = null;

function initGameFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    auth = firebase.auth();
}

// Initialize Firebase
initGameFirebase();

// GameScores API
window.GameScores = {
    async saveScore(gameId, score, playerName = null) {
        if (!auth.currentUser) {
            console.warn('User must be logged in to save scores');
            return { success: false, error: 'Not logged in' };
        }

        try {
            const userId = auth.currentUser.uid;
            const email = auth.currentUser.email;
            const displayName = playerName || email.split('@')[0];
            const docId = `${gameId}__${userId}`;
            const docRef = db.collection('scores').doc(docId);
            
            const existing = await docRef.get();
            if (existing.exists && existing.data().score >= score) {
                return { success: false, message: 'Not a high score' };
            }

            await docRef.set({
                gameId: gameId,
                userId: userId,
                score: score,
                playerName: displayName,
                email: email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, score: score };
        } catch (error) {
            console.error('Error saving score:', error);
            return { success: false, error: error.message };
        }
    },

    async getPlayerHighScore(gameId) {
        if (!auth.currentUser) {
            return null;
        }

        try {
            const userId = auth.currentUser.uid;
            const docId = `${gameId}__${userId}`;
            const doc = await db.collection('scores').doc(docId).get();
            
            if (doc.exists) {
                return doc.data().score;
            }
            return null;
        } catch (error) {
            console.error('Error getting player score:', error);
            return null;
        }
    },

    async getLeaderboard(gameId, limit = 5) {
        try {
            const snapshot = await db.collection('scores')
                .where('gameId', '==', gameId)
                .get();

            const leaderboard = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                leaderboard.push({
                    playerName: data.playerName,
                    score: data.score,
                    timestamp: data.timestamp
                });
            });

            leaderboard.sort((a, b) => b.score - a.score);
            return leaderboard.slice(0, limit);
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            console.error('ERROR DETAILS:', error.code, error.message);
            return [];
        }
    },

    getCurrentUser() {
        return auth.currentUser;
    },

    isLoggedIn() {
        return auth.currentUser !== null;
    }
};
