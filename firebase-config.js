// firebase-config.js

// Importação via CDN NÃO usa "import {} from ..."
// O Firebase já está carregado pelos <script> do HTML.
// Apenas inicializamos aqui.

const firebaseConfig = {
  apiKey: "AIzaSyCj8X-1NJHmJZKMvfmi3du9m4KUCCt-pWA",
  authDomain: "app-emprestimo-b9dfa.firebaseapp.com",
  projectId: "app-emprestimo-b9dfa",
  storageBucket: "app-emprestimo-b9dfa.appspot.com",
  messagingSenderId: "707710620874",
  appId: "1:707710620874:web:3edf7a7341bce35cfa5033"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Instâncias globais
const auth = firebase.auth();
const db = firebase.firestore();
