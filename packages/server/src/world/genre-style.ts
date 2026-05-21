/**
 * genre-style.ts — Genre detection and narrator style guides
 *
 * Detects the genre of a mystery from the host's theme prompt using a
 * keyword heuristic. Falls back to a single gpt-5-nano call (strict
 * enum response) when the heuristic is ambiguous.
 *
 * The result is cached on the session (one detection per game). Style
 * guides are returned as plain objects and injected into both the
 * world-generation prompt and the per-turn narrator prompt.
 *
 * @author AKBOYS Team
 * @since 2026-05-08
 */

import OpenAI from 'openai';

const DEBUG = '[genre-style]';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GenreTag =
  | 'noir'
  | 'sci-fi'
  | 'gothic-horror'
  | 'period-drama'
  | 'cyberpunk'
  | 'fantasy'
  | 'modern-thriller'
  | 'cosmic-horror'
  | 'generic';

export interface StyleGuide {
  genre: GenreTag;
  /** Sentence rhythm, vocabulary, and atmosphere instructions for the narrator */
  narratorVoiceRules: string;
  /** Sensory details typical for room descriptions in this genre */
  roomDescriptionFlavor: string;
  /** How NPCs speak, phrase things, and interact in this genre */
  npcDialoguePatterns: string;
}

/* ------------------------------------------------------------------ */
/*  Style guide library                                                */
/* ------------------------------------------------------------------ */

const STYLE_GUIDES: Record<GenreTag, StyleGuide> = {
  noir: {
    genre: 'noir',
    narratorVoiceRules:
      'Kısa, sert cümleler. Sinik gözlemler. Yağmur, gölge, pişmanlık. Asla iyimser olma. '
      + 'Türkçe kara-roman tonu: doğrudan, kaderci, süslemesiz. '
      + 'Benzetmeleri az ve keskin kullan ("kurşun gibi bir bakış").',
    roomDescriptionFlavor:
      'Dumanlı iç mekanlar. Kehribar lambası ışığı. Yağmurla ıslanmış sokaklar. '
      + 'Mobilyalardaki sigara yanıkları. Ucuz parfüm ve viski kokusu. '
      + 'Jaluzi gölgeleri. Birikintilerde neon yansımaları.',
    npcDialoguePatterns:
      'Kısa yanıtlar. Çift anlamlar. Kibarlığın arkasında tedirginlik. '
      + 'Herkesin bir çıkarı var. Köşeye sıkışınca mizah ya da saldırganlıkla savuşturur.',
  },
  'sci-fi': {
    genre: 'sci-fi',
    narratorVoiceRules:
      'Klinik kesinlik, arada hayranlık. Teknik terimler doğal, gösterişsiz kullanılır. '
      + 'Büyükü (uzay, veri, zaman) küçükle karşılaştır (tek bir can çekişen beden). '
      + 'Türkçe: açık, doğrudan, bilimsel kayıt dili.',
    roomDescriptionFlavor:
      'Steril floresan ya da soğuk mavi aydınlatma. Yaşam desteği sisteminin uğultusu. '
      + 'Ayakların altında metal ızgara. Holografik ekranlar. '
      + 'Geri dönüştürülmüş hava ve ısınan devre kokusu. Uzaktan gelen alarmlar.',
    npcDialoguePatterns:
      'Kesin ve verimli konuşur. Jargon karakterin bir parçası. '
      + 'Duygular bastırılır ya da sistemler/veri üzerinden aktarılır. '
      + 'Üst rütbeli karakterler edilgen ses kullanır.',
  },
  'gothic-horror': {
    genre: 'gothic-horror',
    narratorVoiceRules:
      'Yavaş, ağır cümleler, korku birikerek büyür. Duyusal aşırılık: soğuk, nem, karanlık, ahşabın gıcırtısı. '
      + 'Açıklanamaz olanı açıklama — beden üzerindeki etkisini anlat. '
      + 'Türkçe gotik: süslü ama barok değil, süsleme olmadan gölge.',
    roomDescriptionFlavor:
      'Titreyen mum ışığı. Küf ve taş tozu. Kırık camdan rüzgar sesi. '
      + 'Ağır kadife perdeler. Gözleri izleyen portreler. '
      + 'Kemiğe işleyen nem. Eski tahta ve altında çürüyen bir şeyin kokusu.',
    npcDialoguePatterns:
      'Resmi, arkaik kayıt. Sırlar örtmecelerle söylenir. '
      + 'Uşaklar parçalar halinde konuşur. Aristokrat maskesi kayar. '
      + 'NPC\'ler doğrudan değil, dolaylı uyarıda bulunur.',
  },
  cyberpunk: {
    genre: 'cyberpunk',
    narratorVoiceRules:
      'Hızlı geçişler. Veri paketi gibi kısa cümleler. Argo ve teknik dil iç içe. '
      + 'Sinik ama kinetik — dünya bozuk ama hâlâ 200\'le gidiyor. '
      + 'Türkçe siberpunk: kentsel argo, marka adları doku olarak, kurumsal dil tehdit olarak.',
    roomDescriptionFlavor:
      'Neonla ıslanmış yağmur. Reklam hologramları. Beton ve krom. '
      + 'Sokak yemeği ve ozon kokusu. Kalabalıklar geçiyor. '
      + 'Güçlendirilmiş bedenler. Veri kabloları duvarların içinde damarlar gibi. Her şey satışta.',
    npcDialoguePatterns:
      'Sokak argosu. Şiddet için kurumsal örtmeceler. '
      + 'Çete sadakati dolaylı anlatılır. NPC\'ler her etkileşimi müzakere eder. '
      + 'Güven para birimidir ve kimsenin yeterince yok.',
  },
  'period-drama': {
    genre: 'period-drama',
    narratorVoiceRules:
      'Ölçülü, resmi ritim. Sosyal sınıf her cümlede görünür. '
      + 'Alt metin metinden çok şey taşır — söylenmeyenler önemli. '
      + 'Türkçe dönem kaydı: Osmanlı etkili resmi dil ya da Cumhuriyet dönemi resmiyet.',
    roomDescriptionFlavor:
      'Cilalı maun. Kristal karaf. Şöminenin çıtırdaması. '
      + 'Gümüş çay takımı. Ütülenmiş keten. Pipo tütünü ve balmumu mumu kokusu. '
      + 'Yüksek pencerelerden görülen resmi bahçe.',
    npcDialoguePatterns:
      'Resmi hitap. Her etkileşimde sınıf işaretçileri. '
      + 'Uşaklar konuşulunca konuşur. Skandal için örtmece. '
      + 'Duygu doğrudan değil, duruş ve kelime tercihi üzerinden aktarılır.',
  },
  fantasy: {
    genre: 'fantasy',
    narratorVoiceRules:
      'Arkaik yapmacıklık olmadan mitik ağırlık. Büyülü olan sıradan gibi; sıradan olan harikulade gibi. '
      + 'Türkçe fantezi: doğrudan ama folklorik sıcaklıkla, atasözleri kazanılmış hissettirmeli.',
    roomDescriptionFlavor:
      'Taş üzerinde meşale ışığı. Bitki ve eski parşömen kokusu. '
      + 'Çatlaklar arasından büyüyen sihirli flora. Uzaktan boynuz ya da çan sesi. '
      + 'Duvarlarda simgeler. Eski büyülerden toz. Yüzyılların ağırlığı.',
    npcDialoguePatterns:
      'Unvanlar tutarlı kullanılır. Yeminler ve bağlayıcı sözler gerçek ağırlık taşır. '
      + 'NPC\'ler kehanet ya da eski bilgiye atıfta bulunur. '
      + 'Duygular doğadan ya da zanaattan alınan mecazlarla aktarılır.',
  },
  'modern-thriller': {
    genre: 'modern-thriller',
    narratorVoiceRules:
      'Sıkı, anlık, şimdiki zaman aciliyeti. Her ayrıntı potansiyel olarak önemli — hiçbir şey dekoratif değil. '
      + 'Paranoya temel durum. Türkçe gerilim: gazetecilik netliği, bürokratik tehdit.',
    roomDescriptionFlavor:
      'Ofislerde floresan şerit. Köşelerde güvenlik kameraları. '
      + 'Yazıcı toner ve paket yemek kokusu. Açık ofis gözetimi. '
      + 'Kirli parayı saklayan temiz yüzeyler. Sokak gürültüsü.',
    npcDialoguePatterns:
      'Herkes ölçülü, profesyonel konuşur — ta ki konuşmaya son verinceye kadar. '
      + 'Bilgi güçtür. NPC\'ler telefonlarını kontrol eder. '
      + 'Baskı aracı olarak sessizlik. Kurumsal dil tehdidin maskesi.',
  },
  'cosmic-horror': {
    genre: 'cosmic-horror',
    narratorVoiceRules:
      'Anlatıcı algıladığını tanımlamakta güçlük çeker. Akıl bir kaynak olarak tükenmektedir. '
      + 'Sıradan dil kenarlarda yetersiz kalır. Türkçe kozmik korku: insani kelimelerin insanlık dışı şeyler için yetersizliği — '
      + 'söylenebileni söyle, söylenemeyende sus.',
    roomDescriptionFlavor:
      'Tutmayan geometri. İsimsiz renkler. Nefes almıyor ama onun gibi hareket eden bir şeyin sesi. '
      + 'Derin okyanus ya da eski taş ya da hiçbir şeyin kokusu. '
      + 'Nesnelere karşılık gelmeyen gölgeler.',
    npcDialoguePatterns:
      'Bilenler parçalar halinde ya da saplantılı tekrarla konuşur. '
      + 'Bilmeyenler bir şeye tanık olana kadar normal konuşur. '
      + 'Araştırma dili büyüye dönüşmüştür. NPC\'ler belirli köşelerden göz kaçırır.',
  },
  generic: {
    genre: 'generic',
    narratorVoiceRules:
      'Açık, doğrudan, doğal Türkçe düzyazı. Kısa cümleler. Normal anlatıcı tonu. Somut olgular. Süsleme yok.',
    roomDescriptionFlavor:
      'Pratik çevre ayrıntıları. Aydınlatma, koku, sıcaklık. Sahneyi sabitleyen nesneler. Dönem özgü bir dil değil.',
    npcDialoguePatterns:
      'Doğal diyalog. Gerçekçi konuşma kalıpları. NPC\'ler kişiliklerine göre konuşur.',
  },
};

export const ALL_GENRE_TAGS: GenreTag[] = [
  'noir', 'sci-fi', 'gothic-horror', 'period-drama', 'cyberpunk',
  'fantasy', 'modern-thriller', 'cosmic-horror', 'generic',
];

/* ------------------------------------------------------------------ */
/*  Keyword heuristic                                                  */
/* ------------------------------------------------------------------ */

const GENRE_KEYWORDS: Array<{ genre: GenreTag; keywords: string[] }> = [
  {
    genre: 'noir',
    keywords: ['noir', 'gangster', 'speakeasy', 'dedektif', 'detective', '1920', '1930', '1940', '1950', 'jazz', 'prohibition', 'private eye', 'hardboiled', 'gece kulübü', 'kara roman', 'mafia', 'mafya'],
  },
  {
    genre: 'cyberpunk',
    keywords: ['cyberpunk', 'siber', 'cyber', 'neon', 'megacorp', 'hacker', 'neural', 'implant', 'implant', 'distopya', 'dystopia', 'chrome', 'megacity', 'netrunner', 'siberpunk'],
  },
  {
    genre: 'sci-fi',
    keywords: ['sci-fi', 'science fiction', 'bilim kurgu', 'space', 'uzay', 'spaceship', 'uzay gemisi', 'space station', 'uzay istasyonu', 'alien', 'robot', 'android', 'colony', 'starship', 'galactic', 'uzak gelecek', 'galaksi'],
  },
  {
    genre: 'gothic-horror',
    keywords: ['gothic', 'gotik', 'horror', 'korku', 'vampire', 'vampir', 'castle', 'şato', 'haunted', 'lanetli', 'mansion', 'konaks', 'victorian', 'viktorya', 'ghost', 'hayalet', 'supernatural', 'doğaüstü'],
  },
  {
    genre: 'cosmic-horror',
    keywords: ['lovecraft', 'cosmic horror', 'kozmik korku', 'eldritch', 'cthulhu', 'ancient god', 'kadim tanrı', 'unspeakable', 'deep one', 'cultist', 'ritual', 'forbidden knowledge', 'yasak bilgi', 'kadim varlık'],
  },
  {
    genre: 'period-drama',
    keywords: ['ottoman', 'osmanlı', 'victorian', 'edwardian', '19. yüzyıl', '19th century', '1800', '18. yüzyıl', 'aristocrat', 'aristokrat', 'manor house', 'konak', 'saray', 'cumhuriyet dönemi', 'period drama'],
  },
  {
    genre: 'fantasy',
    keywords: ['fantasy', 'fantezi', 'magic', 'sihir', 'wizard', 'büyücü', 'dragon', 'ejderha', 'elf', 'dwarf', 'medieval', 'ortaçağ', 'kingdom', 'krallık', 'sorcerer', 'spell', 'büyü', 'kale', 'orc'],
  },
  {
    genre: 'modern-thriller',
    keywords: ['corporate', 'şirket', 'spy', 'ajan', 'government', 'hükümet', 'conspiracy', 'komplo', 'thriller', 'gerilim', 'agent', 'heist', 'modern', 'günümüz', 'contemporary', 'çağdaş'],
  },
];

function heuristicDetect(prompt: string): GenreTag | null {
  const lower = prompt.toLowerCase();
  const scores: Partial<Record<GenreTag, number>> = {};

  for (const { genre, keywords } of GENRE_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[genre] = (scores[genre] ?? 0) + 1;
      }
    }
  }

  const entries = Object.entries(scores) as Array<[GenreTag, number]>;
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);
  const [topGenre, topScore] = entries[0];
  if (topScore < 1) return null;

  // Ambiguous: two genres within 1 point → defer to LLM
  if (entries.length > 1 && entries[1][1] >= topScore) return null;

  return topGenre;
}

/* ------------------------------------------------------------------ */
/*  LLM fallback (gpt-5-nano, strict enum, < 500ms)                   */
/* ------------------------------------------------------------------ */

async function llmDetect(prompt: string): Promise<GenreTag> {
  const t0 = Date.now();
  try {
    const completion = await client().chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        {
          role: 'system',
          content:
            `Classify the mystery game theme prompt into exactly one genre tag. `
            + `Reply with ONLY the tag — no explanation, no punctuation.\n`
            + `Valid tags: ${ALL_GENRE_TAGS.join(' | ')}`,
        },
        {
          role: 'user',
          content: `Theme: "${prompt}"`,
        },
      ],
      // gpt-5.x family rejects max_tokens — must use max_completion_tokens.
      // Without this the call 400'd and we silently fell through to
      // genre='generic' for every prompt, killing the noir / sci-fi /
      // gothic tonal amplification.
      max_completion_tokens: 20,
    });

    const text = (completion.choices[0]?.message?.content ?? '').trim().toLowerCase();
    const match = ALL_GENRE_TAGS.find((g) => text.includes(g));
    const result = match ?? 'generic';
    console.log(`${DEBUG} LLM detect="${text}" → ${result} (${Date.now() - t0}ms)`);
    return result;
  } catch (err) {
    console.error(`${DEBUG} LLM fallback failed, using generic:`, (err as Error).message);
    return 'generic';
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Detect the genre of a mystery from the host's prompt.
 * Uses keyword heuristic first; falls back to a single LLM call when ambiguous.
 * Always resolves — never throws.
 */
export async function detectGenre(hostPrompt: string): Promise<GenreTag> {
  if (!hostPrompt.trim()) return 'generic';

  const heuristic = heuristicDetect(hostPrompt);
  if (heuristic !== null) {
    console.log(`${DEBUG} heuristic → ${heuristic}`);
    return heuristic;
  }

  return llmDetect(hostPrompt);
}

/** Return the style guide for a genre tag. Falls back to 'generic' for unknown tags. */
export function getStyleGuide(genre: string): StyleGuide {
  return STYLE_GUIDES[genre as GenreTag] ?? STYLE_GUIDES.generic;
}
