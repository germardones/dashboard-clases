// ============================================================
//  CONFIGURACIÓN FIREBASE
//  1. Ve a https://console.firebase.google.com
//  2. Crea un proyecto → Web App → copia tu config aquí
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyCwYw5Dg71Kx-XDCeWMKqIWOVPq5z5URQM",
  authDomain:        "dashboard-clases.firebaseapp.com",
  projectId:         "dashboard-clases",
  storageBucket:     "dashboard-clases.firebasestorage.app",
  messagingSenderId: "329516504476",
  appId:             "1:329516504476:web:62d7190d83baa289d4a459",
  measurementId:     "G-PC6S6Q11LX"
};

// Exporta para que app.js y sugerencias.html lo consuman
window.FIREBASE_CONFIG = firebaseConfig;
