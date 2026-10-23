import { it } from 'vitest';
import { searchTracks, resolveAudioStream } from '../src/api/innertube';
it.skipIf(process.env.LINER_ARTIST_PROBE !== '1')('diagnoses user reported recordings without exposing signed URLs', async () => {
 for (const query of ['Gestão Inteligente Ryu The Runner', 'Guap850 Leviano Ryu The Runner']) {
  try {
   const tracks = await searchTracks(query);
   console.info('Catalog probe', query, tracks.slice(0, 3).map(({id,title,artists,durationMs}) => ({id,title,artists,durationMs})));
   for(const t of tracks.slice(0,2)) {
    try { const url=await resolveAudioStream(t.id,t.title,t.artists,{durationMs:t.durationMs,forceRefresh:true}); console.info('Stream resolved',t.id,new URL(url).hostname); }
    catch(e) { console.info('Stream failed',t.id,e instanceof Error ? e.message : 'Unknown'); }
   }
  } catch(e) { console.info('Catalog failed', query,e instanceof Error ? e.message : 'Unknown'); }
 }
}, 150000);
