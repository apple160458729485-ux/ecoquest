import { GoogleGenerativeAI } from "@google/generative-ai";
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { initializeApp } from "firebase/app";
import { getDatabase, onValue, push, ref } from "firebase/database";
import { Camera, Crosshair, Map as MapIcon } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ★ assets フォルダに shujug.png を入れている前提
import ShugoJu from '../../assets/shujug.png';

// --- 地図のWeb対応設定 ---
let MapView: any, Marker: any;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
} else {
  MapView = ({ children, style }: any) => (
    <View style={[style, { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{color: '#888', textAlign: 'center', padding: 20}}>
        【Web版】マップは準備中です。{"\n"}スマホ版アプリで地図が表示されます。
      </Text>
    </View>
  );
  Marker = () => null;
}

// --- Firebase 設定 ---
const firebaseConfig = { 
  apiKey: "AIzaSyBydO6RU-hLZV_Fu690t0AJOsSjWFilcRw",
  authDomain: "ecoquest-fb12a.firebaseapp.com",
  databaseURL: "https://ecoquest-fb12a-default-rtdb.firebaseio.com",
  projectId: "ecoquest-fb12a",
  storageBucket: "ecoquest-fb12a.firebasestorage.app",
  messagingSenderId: "930348078549",
  appId: "1:930348078549:web:cdd265b30b348a793a995c",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Gemini 設定 (VercelのEnvironment Variables設定を推奨)
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "AIzaSyBydO6RU-hLZV_Fu690t0AJOsSjWFilcRw";
const genAI = new GoogleGenerativeAI(API_KEY);

export default function EcoQuestFinal() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'MAP' | 'CAMERA'>('MAP');
  const [markers, setMarkers] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    const markersRef = ref(db, 'markers/');
    onValue(markersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMarkers(list);
      }
    });
  }, []);

  // ★ AI認識ロジック（精度強化版）
  const analyzeImageWithGemini = async (base64Photo: string) => {
    try {
      const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
      
      // プロンプトをより具体的に修正
      const prompt = "あなたは環境保護の専門家です。この画像に写っているゴミを1つ特定し、『ペットボトル』『空き缶』『紙くず』『プラスチック』『その他』の中から最も適切なものを1つだけ日本語で答えてください。説明や挨拶は一切不要です。単語のみを返してください。";
      
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Photo, mimeType: "image/jpeg" } }
      ]);
      const responseText = result.response.text().trim();
      console.log("AI解析結果:", responseText);
      return responseText;
    } catch (err) {
      console.error("AI解析エラー:", err);
      throw err;
    }
  };

  const handlePress = async () => {
    if (mode === 'MAP') {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          Alert.alert("カメラ許可", "設定からカメラの使用を許可してください。");
          return;
        }
      }
      setMode('CAMERA');
    } else {
      handleCaptureAndUpload();
    }
  };

  const handleCaptureAndUpload = async () => {
    if (cameraRef.current && !isAnalyzing) {
      try {
        setIsAnalyzing(true);
        // 画像の品質を少し上げてAIが読みやすくする
        const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
        
        const trashType = await analyzeImageWithGemini(photo.base64);
        
        let loc = { coords: { latitude: 35.6812, longitude: 139.7671 } };
        try {
          loc = await Location.getCurrentPositionAsync({});
        } catch (e) {
          console.log("位置情報取得失敗、デフォルト値を使用します");
        }

        await push(ref(db, 'markers/'), {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          type: trashType,
          timestamp: Date.now()
        });

        setIsAnalyzing(false);
        Alert.alert("鑑定完了！", `守護獣が「${trashType}」を認識しました！`);
        setMode('MAP');
      } catch (error: any) {
        setIsAnalyzing(false);
        Alert.alert("鑑定エラー", "うまく認識できませんでした。もう一度試してね！");
      }
    }
  };

  return (
    <View style={styles.container}>
      {mode === 'MAP' ? (
        <MapView style={styles.fullScreen} showsUserLocation={true}>
          {markers.map((m: any) => (
            <Marker 
              key={m.id} 
              coordinate={{latitude: m.lat, longitude: m.lng}} 
              title={m.type}
              pinColor={m.type.includes('ペットボトル') ? 'blue' : 'green'}
            />
          ))}
        </MapView>
      ) : (
        <CameraView style={styles.fullScreen} ref={cameraRef} />
      )}

      {/* キャラクター演出 */}
      {isAnalyzing && (
        <View style={styles.characterOverlay}>
          <Image source={ShugoJu} style={styles.characterImage} />
          <View style={styles.speechBubble}>
            <Text style={styles.speechBubbleText}>鑑定中だモン！</Text>
            <Text style={styles.speechBubbleText}>ちょっと待ってね！</Text>
            <ActivityIndicator color="#2ecc71" style={{marginTop: 10}} />
          </View>
        </View>
      )}

      <View style={styles.overlay}>
        {mode === 'CAMERA' && (
          <TouchableOpacity 
            style={[styles.subButton, {backgroundColor: 'rgba(0,0,0,0.5)', marginBottom: 15}]} 
            onPress={() => setMode('MAP')}
          >
             <MapIcon color="#fff" size={20} />
             <Text style={styles.buttonTextSmall}>地図へ戻る</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.mainButton} onPress={handlePress}>
          {mode === 'MAP' ? <Camera color="#fff" /> : <Crosshair color="#fff" />}
          <Text style={styles.buttonText}>{mode === 'MAP' ? "ゴミを探す" : "AIで鑑定"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  fullScreen: { flex: 1 },
  overlay: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  mainButton: { 
    backgroundColor: '#2ecc71', flexDirection: 'row', paddingVertical: 15, paddingHorizontal: 30, 
    borderRadius: 50, alignItems: 'center', elevation: 10
  },
  subButton: { flexDirection: 'row', padding: 10, borderRadius: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  buttonTextSmall: { color: '#fff', fontSize: 14, marginLeft: 5 },
  characterOverlay: {
    position: 'absolute', top: '15%', alignSelf: 'center', alignItems: 'center', zIndex: 100
  },
  characterImage: { width: 180, height: 180, resizeMode: 'contain', marginBottom: -15 },
  speechBubble: {
    backgroundColor: 'rgba(255,255,255,0.95)', padding: 20, borderRadius: 25, 
    borderWidth: 3, borderColor: '#2ecc71', alignItems: 'center', width: 250
  },
  speechBubbleText: { fontSize: 18, fontWeight: 'bold', color: '#333' }
});