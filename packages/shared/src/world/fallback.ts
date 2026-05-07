/**
 * fallback.ts — Turkish hardcoded Velvet Shadow world
 *
 * Used when AI world generation fails (rare). Ensures the game can always
 * start with a valid, playable noir mystery.
 *
 * Scales entryScenes to player count 2-10 by cycling through room list.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import type { WorldData } from './schema.js';

export function getFallbackWorld(playerCount: number): WorldData {
  const clamped = Math.min(Math.max(playerCount, 2), 10);

  const allEntryScenes = [
    {
      roomId: 'detective_office',
      narrativeHook:
        'Masandaki dosya saatlerdir seni bekliyor. Yağmur camı dövüyor, sokaktaki neon tabela duvarına kırmızı ve mavi lekeler bırakıyor. Telefon çaldı, bir daha çalmayacak. İçindeki tek mesaj: "Velvet Lounge. Acele et."',
    },
    {
      roomId: 'rain_soaked_street',
      narrativeHook:
        'Yağmurun altında bekliyorsun. Velvet Lounge\'un neon tabelası karşı kaldırımı ıslatıyor. Gri paltolu bir adam seni sabit gözlerle izliyor. Arkandaki siyah sedanın motoru hâlâ sıcak.',
    },
    {
      roomId: 'velvet_lounge',
      narrativeHook:
        'Barda oturuyorsun. Mickey Malone kadehini asla istemediğin kadar dolu dolduruyor, elleri titriyor. Sahne boş. Orkestra tereddütle akort ediyor. Her birkaç dakikada biri perdenin ardına bakıyor.',
    },
    {
      roomId: 'backstage',
      narrativeHook:
        'Makyaj masasındaki ampul hâlâ yanıyor. Rujun hâlâ sıcak. Yerde kopmuş gümüş bir kolye — sanki koparılmış, düşmemiş. Günlüğü son gece yarısında açık, mürekkebi dağılmış.',
    },
    {
      roomId: 'back_alley',
      narrativeHook:
        'Bir adam bir su birikintisinin içinde yatıyor. Yüzü dövülmüş ama nefes alıyor. Ona "Fısıldayan Pete" derler. Dudakları kıpırdıyor: "Barmene güvenme..." Sonra bilincini kaybediyor.',
    },
  ];

  const entryScenes = Array.from({ length: clamped }, (_, i) => ({
    ...allEntryScenes[i % allEntryScenes.length],
  }));

  return {
    meta: {
      title: 'The Velvet Shadow',
      setting: '1927 Chicago. Yağmur üç gündür dinmedi. Yasak kumarhaneler, caz kulüpleri, herkesin bir sırrı var.',
      visualStylePrompt: '1920s noir ink illustration, chiaroscuro shadows, sepia and deep blue tones, hand-drawn feel, cinematic composition',
      openingImagePrompt: 'A rain-soaked 1920s Chicago street at night, neon sign reading "VELVET" reflected in puddles, no people, atmospheric, film noir',
    },
    rooms: [
      {
        id: 'detective_office',
        name: 'Dedektif Ofisi',
        description: 'Yüksek bir binanın üçüncü katı. Yağmur damarı camda. Sigara kokusu ve ucuz viski.',
        exits: { north: null, south: 'rain_soaked_street', east: null, west: null, up: null, down: null },
        imagePrompt: 'A cramped 1920s detective office at night, rain-streaked window, desk with case file and bourbon bottle, neon light through blinds',
      },
      {
        id: 'rain_soaked_street',
        name: 'Yağmurlu Sokak',
        description: 'Velvet Lounge\'un önü. Neon tabela yansıyor. Siyah bir sedan park etmiş.',
        exits: { north: 'detective_office', south: null, east: 'velvet_lounge', west: 'back_alley', up: null, down: null },
        imagePrompt: 'A rain-drenched 1920s Chicago street, VELVET neon sign reflecting in puddles, a parked black sedan, steam from manholes',
      },
      {
        id: 'velvet_lounge',
        name: 'Velvet Lounge',
        description: 'Mahogani bar, duman içinde bir caz kulübü. Bartender Mickey. Sahne boş.',
        exits: { north: null, south: null, east: null, west: 'rain_soaked_street', up: null, down: 'backstage' },
        imagePrompt: 'The interior of a 1920s speakeasy jazz lounge, smoky, empty stage, long mahogany bar, dim amber lighting',
      },
      {
        id: 'backstage',
        name: 'Sahne Arkası',
        description: 'Lena\'nın soyunma odası. Kopmuş kolye yerde. Günlük açık.',
        exits: { north: null, south: null, east: null, west: null, up: 'velvet_lounge', down: null },
        imagePrompt: 'A performer\'s dressing room, vanity mirror with bulbs, broken silver necklace on the floor, open diary, warm tungsten light',
      },
      {
        id: 'back_alley',
        name: 'Arka Sokak',
        description: 'Velvet Lounge\'un arkasındaki kirli sokak. Whisper Pete yerde.',
        exits: { north: null, south: null, east: 'rain_soaked_street', west: null, up: null, down: null },
        imagePrompt: 'A dirty 1920s back alley at night, brick walls, puddles, a crumpled figure in the shadows, steam rising',
      },
    ],
    npcs: [
      {
        id: 'bartender_mickey',
        name: 'Mickey "Pour" Malone',
        role: 'barmen',
        roomId: 'velvet_lounge',
        description: 'Elleri titreyen, orta yaşlı bir barmen. Gözlerini fazla hızlı kaçırır. Önlüğünde tanımadığın bir koku var.',
        portraitPrompt: 'A middle-aged 1920s bartender with tired eyes and a white apron, behind a mahogany bar, dim light, nervous expression',
        personality: 'nervous',
        alibiClaim: 'Bütün gece barın arkasındaydım, on iki oldu, on dört oldu, hep buradaydım.',
        alibi: {
          claimedLocation: 'Velvet Lounge bar tezgahının arkası',
          claimedActivity: 'Kadeh silip müşterilere servis yapıyordu',
          corroboratedBy: null,
          inconsistency: 'İddia ettiği saatte bar tezgahının arkasındaydı; ama barın kayıt defterinde o gece 22:30\'da "bodruma stok almaya indi" notu var — tam kurbanın kaybolduğu zaman.',
        },
        backstory: 'Mickey Malone, on iki yıldır Velvet Lounge\'un barmenliğini yapıyor. Chicago\'ya İrlanda\'dan genç yaşta göç etti, ailesini geride bıraktı. Mafyayla eski bir borç ilişkisi var; bu yüzden her zaman birinin verdiği emirlere uyuyor.',
        knownInfo: 'Mickey, Lena\'yı kendisi kaçırdı çünkü mafya onu susturmak istiyordu. Şarap mahzenine sakladı, sabaha teslim edecekti. Kibrit kutusunda adı yazıyor çünkü unuttu.',
        hiddenSecret: 'Lena\'yı mafyadan korumak için kaçırdı. Eldeki tek kanıt kibrit kutusu — rutubetli şarap mahzenine gizledi.',
        isCulprit: true,
      },
      {
        id: 'stagehand_tommy',
        name: 'Tommy "Tramvay" Shaw',
        role: 'sahne hizmetlisi',
        roomId: 'backstage',
        description: 'Genç, sinirli, parmakları sürekli ceplerini karıştıran bir çocuk. Omzunda tuhaf bir zayıflık.',
        portraitPrompt: 'A young 1920s stagehand in a wool cap, worn jacket, anxious expression, backstage dim lighting',
        personality: 'suspicious',
        alibiClaim: 'Sahne arkasındaydım, Lena\'yı son gördüğüm yer makyaj masasıydı, şarkıdan önce.',
        alibi: {
          claimedLocation: 'Sahne arkası, depo odası',
          claimedActivity: 'Sahne dekorlarını düzenliyordu',
          corroboratedBy: null,
          inconsistency: null,
        },
        backstory: 'Tommy Shaw, on sekiz yaşında küçük bir kasabadan Chicago\'ya kaçtı. Velvet Lounge\'da hizmetli olarak başladı; Lena\'nın sesini ilk duyduğu günden beri ona hayran. Kendi yarım kalmış bir trompet eğitimi var.',
        knownInfo: 'Tommy, Lena\'nın günlüğünün varlığını biliyor ve onu ilk bulan o oldu — gizli tutmaya çalışıyor çünkü içinde kendisi hakkında bir paragraf var.',
        hiddenSecret: 'Lena\'ya aşıktı ve günlükte adı geçiyordu. Utançtan dolayı bunu saklıyor. Cinayetle ilgisi yok.',
        isCulprit: false,
      },
      {
        id: 'informant_pete',
        name: 'Fısıldayan Pete',
        role: 'muhbir',
        roomId: 'back_alley',
        description: 'Yüzü dövülmüş, her iki ayağı farklı yönlere bakan, nefesi koklanacak kadar keskin.',
        portraitPrompt: 'A beaten, elderly street informant with a bruised face, ragged coat, lying on wet pavement, dim alley light',
        personality: 'erratic',
        alibiClaim: 'Ben sadece haberleri duyarım, olaylara karışmam. Dün gece kimseye söz etmedim.',
        alibi: {
          claimedLocation: 'Arka sokakta, çöp tenekelerinin yanında',
          claimedActivity: 'Uyuyordu',
          corroboratedBy: null,
          inconsistency: null,
        },
        backstory: 'Pete, eski bir gazete muhabiri. Bir yolsuzluk haberini yayımladıktan sonra işini kaybetti, ardından ailesi dağıldı. Şimdi bilgi satarak geçiniyor; kimseden güvence beklemez, kimseye güvenmez.',
        knownInfo: 'Pete, Lena\'yla konuştuğunu ve mafyanın onun peşinde olduğunu biliyor. Mickey\'nin bunu öğrendiğinde Lena\'yı koruma altına aldığını tahmin ediyor ama emin değil.',
        hiddenSecret: 'Aslında Mickey ona "Lena\'yı saklıyorum" dedi. Ama korkudan söylemiyor. Dövülmesi mafyadan, Mickey\'den değil.',
        isCulprit: false,
      },
    ],
    items: [
      {
        id: 'case_file',
        name: 'Dava Dosyası',
        description: 'Kaba kahverengi kapaklı bir dosya. İçinde Lena Hart\'ın fotoğrafı, son performansının tarihi, aileden kimse aramıyor notu.',
        roomId: 'detective_office',
        isEvidence: false,
        isRedHerring: false,
      },
      {
        id: 'matchbook',
        name: 'Kibrit Kutusu',
        description: 'Velvet Lounge logolu kırmızı bir kibrit kutusu. İç kapağında kurşun kalemle tek bir kelime: "Malone".',
        roomId: 'velvet_lounge',
        isEvidence: true,
        isRedHerring: false,
      },
      {
        id: 'broken_necklace',
        name: 'Kopmuş Kolye',
        description: 'Gümüş bir kolye, zinciri sertçe çekilerek kopmuş. Yere düşmüş gibi değil, koparılmış.',
        roomId: 'backstage',
        isEvidence: true,
        isRedHerring: false,
      },
      {
        id: 'singers_diary',
        name: 'Şarkıcının Günlüğü',
        description: 'Mor deri kapaklı, son sayfası kırmızı mühürlü. Son giriş: "Malone öğrenirse beni de öldürür."',
        roomId: 'backstage',
        isEvidence: true,
        isRedHerring: false,
      },
      {
        id: 'cigarette_butt',
        name: 'Sigara İzmariti',
        description: 'Lucky Strike markalı bir izmarit, yanındaki kana karışmış. Tommy\'nin cebinden düşmüş olabilir — ya da başka birinin.',
        roomId: 'rain_soaked_street',
        isEvidence: false,
        isRedHerring: true,
      },
    ],
    entryScenes,
    openingNarration:
      'Yağmur, Lena Hart kaybolduğu geceden beri dinmedi. Velvet Lounge\'un caz şarkıcısı dün gece yarısından sonra kimse tarafından görülmedi. Bu gece beş dedektif aynı soruyu sormak için uyandı — ama farklı kapılardan girdiler. Şehir sabaha kadar bir cevap bekliyor.',
    solution: {
      culpritNpcId: 'bartender_mickey',
      motiveShort: 'Lena\'yı mafyadan korumak için kaçırdı, ama planı çöktü ve izleri temizlemeyi başaramadı.',
      keyEvidenceId: 'matchbook',
    },
  };
}
