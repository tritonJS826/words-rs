// Netlify Function: TTS-прокси для Google Translate
// URL: /.netlify/functions/tts?text=zdravo

const LAT2Cyr = {lj:'љ',nj:'њ','dž':'џ',a:'а',b:'б',c:'ц','č':'ч','ć':'ћ',d:'д','đ':'ђ',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'ј',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',r:'р',s:'с','š':'ш',t:'т',u:'у',v:'в',z:'з','ž':'ж'};

function toCyrText(s){
  s = String(s).toLowerCase().normalize('NFC'); let o = '';
  for (let i=0;i<s.length;i++){
    const two = s.substr(i,2);
    if (LAT2Cyr[two]){ o += LAT2Cyr[two]; i++; } else o += LAT2Cyr[s[i]] || s[i];
  }
  return o;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const text = event.queryStringParameters?.text || 'zdravo';
  const t = toCyrText(text);

  const urls = [
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=sr&client=no&q=${encodeURIComponent(t)}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=sr&client=chromium&q=${encodeURIComponent(text)}`
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Netlify; +https://netlify.com)',
          'Referer': 'https://translate.google.com/'
        }
      });
      if (!resp.ok) continue;
      const audioBuffer = await resp.arrayBuffer();
      if (!audioBuffer || audioBuffer.byteLength < 200) continue;

      const bytes = new Uint8Array(audioBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        },
        body: base64,
        isBase64Encoded: true
      };
    } catch (e) {}
  }

  return {
    statusCode: 502,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'TTS service unavailable' })
  };
}