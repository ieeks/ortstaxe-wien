/* Zugangsdaten des Firebase-Projekts.

   Das ist bewusst kein Geheimnis: Firebase-Web-Configs sind öffentlich, der
   apiKey ist eine Projektkennung und kein Zugangsschlüssel. Der Schutz kommt
   ausschließlich aus firestore.rules. Wer die Datei liest, kommt an keine
   fremden Daten — wer die Rules aufweicht, gibt alles frei. */

export const firebaseConfig = {
  apiKey: "AIzaSyB3Cc6YemaaHwn9t7Jh5QC3Ev-mCJroz_Y",
  authDomain: "ortstaxe-wien.firebaseapp.com",
  projectId: "ortstaxe-wien",
  storageBucket: "ortstaxe-wien.firebasestorage.app",
  messagingSenderId: "354625534250",
  appId: "1:354625534250:web:701803848e50765be7c653"
};

/* Analytics wird nicht geladen: das Werkzeug rechnet eine Steuererklärung,
   dafür braucht niemand Nutzungsmessung. Die measurementId aus der Console
   ist deshalb absichtlich nicht übernommen.

   Version des Firebase-SDK. Sie wird als CDN-Pfad benutzt und ist bewusst
   fest gepinnt — ein „latest“ würde das Werkzeug ohne Zutun ändern.

   ACHTUNG: Diese Version konnte in der Entwicklungsumgebung nicht überprüft
   werden, weil dort kein Zugriff auf gstatic.com bestand. Lädt das Werkzeug
   nicht und meldet einen SDK-Fehler, ist hier die richtige Version
   einzutragen — die aktuelle steht unter
   https://firebase.google.com/support/release-notes/js */
export const FIREBASE_SDK = '11.0.2';
