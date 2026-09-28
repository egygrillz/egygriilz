import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import 'firebase/compat/app-check';
import 'firebase/compat/messaging';
import {getAuth,getMultiFactorResolver,TotpMultiFactorGenerator,multiFactor,reauthenticateWithCredential,EmailAuthProvider} from 'firebase/auth';
window.firebase=firebase;
window.egyMfa={getAuth,getMultiFactorResolver,TotpMultiFactorGenerator,multiFactor,reauthenticateWithCredential,EmailAuthProvider};
