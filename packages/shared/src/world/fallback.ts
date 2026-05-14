/**
 * fallback.ts — Hardcoded Velvet Shadow world (bilingual after #58)
 *
 * Used when AI world generation fails (rare). Ensures the game can always
 * start with a valid, playable noir mystery in either locale.
 *
 * Scales entryScenes to player count 2-10 by cycling through room list.
 *
 * @author AKBOYS Team
 * @since 2026-04-17 (original), 2026-05-13 (bilingual)
 */

import type { WorldData } from './schema.js';

export function getFallbackWorld(playerCount: number): WorldData {
  const clamped = Math.min(Math.max(playerCount, 2), 10);

  const allEntryScenes = [
    {
      roomId: 'detective_office',
      narrativeHook: {
        tr: 'Masandaki dosya saatlerdir seni bekliyor. Yağmur camı dövüyor, sokaktaki neon tabela duvarına kırmızı ve mavi lekeler bırakıyor. Telefon çaldı, bir daha çalmayacak. İçindeki tek mesaj: "Velvet Lounge. Acele et."',
        en: 'The file on your desk has been waiting for hours. Rain hammers the window, the neon sign outside paints the wall in red and blue. The phone rang once and went silent. The only message: "Velvet Lounge. Hurry."',
      },
    },
    {
      roomId: 'rain_soaked_street',
      narrativeHook: {
        tr: 'Yağmurun altında bekliyorsun. Velvet Lounge\'un neon tabelası karşı kaldırımı ıslatıyor. Gri paltolu bir adam seni sabit gözlerle izliyor. Arkandaki siyah sedanın motoru hâlâ sıcak.',
        en: 'You wait in the rain. The Velvet Lounge neon stains the opposite sidewalk with light. A man in a grey overcoat watches you with steady eyes. The black sedan behind you still has a warm engine.',
      },
    },
    {
      roomId: 'velvet_lounge',
      narrativeHook: {
        tr: 'Barda oturuyorsun. Mickey Malone kadehini asla istemediğin kadar dolu dolduruyor, elleri titriyor. Sahne boş. Orkestra tereddütle akort ediyor. Her birkaç dakikada biri perdenin ardına bakıyor.',
        en: 'You sit at the bar. Mickey Malone pours your glass fuller than you ever asked for, hands trembling. The stage is empty. The band tunes up half-heartedly. Every few minutes someone glances behind the curtain.',
      },
    },
    {
      roomId: 'backstage',
      narrativeHook: {
        tr: 'Makyaj masasındaki ampul hâlâ yanıyor. Rujun hâlâ sıcak. Yerde kopmuş gümüş bir kolye — sanki koparılmış, düşmemiş. Günlüğü son gece yarısında açık, mürekkebi dağılmış.',
        en: 'The vanity bulb is still burning. The lipstick is still warm. A snapped silver necklace lies on the floor — torn, not dropped. Her diary is open to last midnight, the ink smeared.',
      },
    },
    {
      roomId: 'back_alley',
      narrativeHook: {
        tr: 'Bir adam bir su birikintisinin içinde yatıyor. Yüzü dövülmüş ama nefes alıyor. Ona "Fısıldayan Pete" derler. Dudakları kıpırdıyor: "Barmene güvenme..." Sonra bilincini kaybediyor.',
        en: 'A man lies in a puddle of rainwater. His face is beaten but he\'s breathing. They call him Whispering Pete. His lips move: "Don\'t trust the bartender..." Then he passes out.',
      },
    },
  ];

  const entryScenes = Array.from({ length: clamped }, (_, i) => ({
    ...allEntryScenes[i % allEntryScenes.length],
  }));

  return {
    meta: {
      title: {
        tr: 'The Velvet Shadow',
        en: 'The Velvet Shadow',
      },
      setting: {
        tr: '1927 Chicago. Yağmur üç gündür dinmedi. Yasak kumarhaneler, caz kulüpleri, herkesin bir sırrı var.',
        en: '1927 Chicago. Rain hasn\'t let up for three days. Speakeasies, jazz clubs, and everyone has a secret.',
      },
      visualStylePrompt: '1920s noir ink illustration, chiaroscuro shadows, sepia and deep blue tones, hand-drawn feel, cinematic composition',
      openingImagePrompt: 'A rain-soaked 1920s Chicago street at night, neon sign reading "VELVET" reflected in puddles, no people, atmospheric, film noir',
    },
    rooms: [
      {
        id: 'detective_office',
        name: 'Dedektif Ofisi',
        description: {
          tr: 'Yüksek bir binanın üçüncü katı. Yağmur damarı camda. Sigara kokusu ve ucuz viski.',
          en: 'Third floor of a tall building. Rain veins on the glass. The smell of cigarettes and cheap whiskey.',
        },
        exits: { north: null, south: 'rain_soaked_street', east: null, west: null, up: null, down: null },
        imagePrompt: 'A cramped 1920s detective office at night, rain-streaked window, desk with case file and bourbon bottle, neon light through blinds',
      },
      {
        id: 'rain_soaked_street',
        name: 'Yağmurlu Sokak',
        description: {
          tr: 'Velvet Lounge\'un önü. Neon tabela yansıyor. Siyah bir sedan park etmiş.',
          en: 'Outside the Velvet Lounge. The neon reflects on wet pavement. A black sedan is parked across the street.',
        },
        exits: { north: 'detective_office', south: null, east: 'velvet_lounge', west: 'back_alley', up: null, down: null },
        imagePrompt: 'A rain-drenched 1920s Chicago street, VELVET neon sign reflecting in puddles, a parked black sedan, steam from manholes',
      },
      {
        id: 'velvet_lounge',
        name: 'Velvet Lounge',
        description: {
          tr: 'Mahogani bar, duman içinde bir caz kulübü. Bartender Mickey. Sahne boş.',
          en: 'A mahogany bar, a jazz club thick with smoke. Mickey is tending bar. The stage is empty.',
        },
        exits: { north: null, south: null, east: null, west: 'rain_soaked_street', up: null, down: 'backstage' },
        imagePrompt: 'The interior of a 1920s speakeasy jazz lounge, smoky, empty stage, long mahogany bar, dim amber lighting',
      },
      {
        id: 'backstage',
        name: 'Sahne Arkası',
        description: {
          tr: 'Lena\'nın soyunma odası. Kopmuş kolye yerde. Günlük açık.',
          en: 'Lena\'s dressing room. A broken necklace lies on the floor. Her diary is open.',
        },
        exits: { north: null, south: null, east: null, west: null, up: 'velvet_lounge', down: null },
        imagePrompt: 'A performer\'s dressing room, vanity mirror with bulbs, broken silver necklace on the floor, open diary, warm tungsten light',
      },
      {
        id: 'back_alley',
        name: 'Arka Sokak',
        description: {
          tr: 'Velvet Lounge\'un arkasındaki kirli sokak. Whisper Pete yerde.',
          en: 'The grimy alley behind the Velvet Lounge. Whispering Pete is on the ground.',
        },
        exits: { north: null, south: null, east: 'rain_soaked_street', west: null, up: null, down: null },
        imagePrompt: 'A dirty 1920s back alley at night, brick walls, puddles, a crumpled figure in the shadows, steam rising',
      },
    ],
    npcs: [
      {
        id: 'bartender_mickey',
        name: 'Mickey "Pour" Malone',
        role: { tr: 'barmen', en: 'bartender' },
        roomId: 'velvet_lounge',
        description: {
          tr: 'Elleri titreyen, orta yaşlı bir barmen. Gözlerini fazla hızlı kaçırır. Önlüğünde tanımadığın bir koku var.',
          en: 'A middle-aged bartender with trembling hands. His eyes flick away too fast. There\'s a smell on his apron you can\'t quite place.',
        },
        portraitPrompt: 'A middle-aged 1920s bartender with tired eyes and a white apron, behind a mahogany bar, dim light, nervous expression',
        personality: 'nervous',
        alibiClaim: {
          tr: 'Bütün gece barın arkasındaydım, on iki oldu, on dört oldu, hep buradaydım.',
          en: 'I was behind the bar all night, twelve o\'clock came and went, two o\'clock came and went, I never left.',
        },
        alibi: {
          claimedLocation: {
            tr: 'Velvet Lounge bar tezgahının arkası',
            en: 'Behind the Velvet Lounge bar counter',
          },
          claimedActivity: {
            tr: 'Kadeh silip müşterilere servis yapıyordu',
            en: 'Wiping glasses and serving customers',
          },
          corroboratedBy: null,
          inconsistency: {
            tr: 'İddia ettiği saatte bar tezgahının arkasındaydı; ama barın kayıt defterinde o gece 22:30\'da "bodruma stok almaya indi" notu var — tam kurbanın kaybolduğu zaman.',
            en: 'He claims to have been behind the bar at that time; but the bar\'s logbook notes "went down to the cellar for stock" at 22:30 that night — exactly when the victim disappeared.',
          },
        },
        backstory: {
          tr: 'Mickey Malone, on iki yıldır Velvet Lounge\'un barmenliğini yapıyor. Chicago\'ya İrlanda\'dan genç yaşta göç etti, ailesini geride bıraktı. Mafyayla eski bir borç ilişkisi var; bu yüzden her zaman birinin verdiği emirlere uyuyor.',
          en: 'Mickey Malone has tended bar at the Velvet Lounge for twelve years. He came from Ireland to Chicago young, left his family behind. He has an old debt to the mob; that\'s why he always answers to someone else\'s orders.',
        },
        knownInfo: {
          tr: 'Mickey, Lena\'yı kendisi kaçırdı çünkü mafya onu susturmak istiyordu. Şarap mahzenine sakladı, sabaha teslim edecekti. Kibrit kutusunda adı yazıyor çünkü unuttu.',
          en: 'Mickey took Lena himself because the mob wanted her silenced. He hid her in the wine cellar, planning to hand her over by morning. His name is on the matchbook because he forgot it there.',
        },
        hiddenSecret: {
          tr: 'Lena\'yı mafyadan korumak için kaçırdı. Eldeki tek kanıt kibrit kutusu — rutubetli şarap mahzenine gizledi.',
          en: 'He took Lena to protect her from the mob. The only piece of evidence left behind is the matchbook — he hid her in the damp wine cellar.',
        },
        isCulprit: true,
      },
      {
        id: 'stagehand_tommy',
        name: 'Tommy "Tramvay" Shaw',
        role: { tr: 'sahne hizmetlisi', en: 'stagehand' },
        roomId: 'backstage',
        description: {
          tr: 'Genç, sinirli, parmakları sürekli ceplerini karıştıran bir çocuk. Omzunda tuhaf bir zayıflık.',
          en: 'Young, jittery, fingers always rummaging through his pockets. There\'s a strange weakness in his shoulder.',
        },
        portraitPrompt: 'A young 1920s stagehand in a wool cap, worn jacket, anxious expression, backstage dim lighting',
        personality: 'suspicious',
        alibiClaim: {
          tr: 'Sahne arkasındaydım, Lena\'yı son gördüğüm yer makyaj masasıydı, şarkıdan önce.',
          en: 'I was backstage; the last time I saw Lena she was at the vanity, just before her number.',
        },
        alibi: {
          claimedLocation: {
            tr: 'Sahne arkası, depo odası',
            en: 'Backstage, the prop room',
          },
          claimedActivity: {
            tr: 'Sahne dekorlarını düzenliyordu',
            en: 'Arranging set pieces',
          },
          corroboratedBy: null,
          inconsistency: null,
        },
        backstory: {
          tr: 'Tommy Shaw, on sekiz yaşında küçük bir kasabadan Chicago\'ya kaçtı. Velvet Lounge\'da hizmetli olarak başladı; Lena\'nın sesini ilk duyduğu günden beri ona hayran. Kendi yarım kalmış bir trompet eğitimi var.',
          en: 'Tommy Shaw ran from a small town to Chicago at eighteen. He started at the Velvet Lounge as a hand; he\'s been smitten with Lena since the first time he heard her sing. He has a half-finished trumpet apprenticeship of his own.',
        },
        knownInfo: {
          tr: 'Tommy, Lena\'nın günlüğünün varlığını biliyor ve onu ilk bulan o oldu — gizli tutmaya çalışıyor çünkü içinde kendisi hakkında bir paragraf var.',
          en: 'Tommy knows the diary exists — he was the first to find it. He\'s trying to keep it hidden because there\'s a paragraph about him inside.',
        },
        hiddenSecret: {
          tr: 'Lena\'ya aşıktı ve günlükte adı geçiyordu. Utançtan dolayı bunu saklıyor. Cinayetle ilgisi yok.',
          en: 'He was in love with Lena and she\'d written about him. He\'s hiding it out of shame. Nothing to do with the crime.',
        },
        isCulprit: false,
      },
      {
        id: 'informant_pete',
        name: 'Fısıldayan Pete',
        role: { tr: 'muhbir', en: 'informant' },
        roomId: 'back_alley',
        description: {
          tr: 'Yüzü dövülmüş, her iki ayağı farklı yönlere bakan, nefesi koklanacak kadar keskin.',
          en: 'Face beaten, feet pointing in two directions, breath sharp enough to wake you up.',
        },
        portraitPrompt: 'A beaten, elderly street informant with a bruised face, ragged coat, lying on wet pavement, dim alley light',
        personality: 'erratic',
        alibiClaim: {
          tr: 'Ben sadece haberleri duyarım, olaylara karışmam. Dün gece kimseye söz etmedim.',
          en: 'I only hear the news, I don\'t get into anything. I didn\'t say a word to anyone last night.',
        },
        alibi: {
          claimedLocation: {
            tr: 'Arka sokakta, çöp tenekelerinin yanında',
            en: 'In the back alley, beside the trash cans',
          },
          claimedActivity: {
            tr: 'Uyuyordu',
            en: 'Sleeping',
          },
          corroboratedBy: null,
          inconsistency: null,
        },
        backstory: {
          tr: 'Pete, eski bir gazete muhabiri. Bir yolsuzluk haberini yayımladıktan sonra işini kaybetti, ardından ailesi dağıldı. Şimdi bilgi satarak geçiniyor; kimseden güvence beklemez, kimseye güvenmez.',
          en: 'Pete used to be a newspaper reporter. He lost his job after running a corruption story; his family fell apart soon after. He sells information to live now; he expects nothing from anyone, trusts no one.',
        },
        knownInfo: {
          tr: 'Pete, Lena\'yla konuştuğunu ve mafyanın onun peşinde olduğunu biliyor. Mickey\'nin bunu öğrendiğinde Lena\'yı koruma altına aldığını tahmin ediyor ama emin değil.',
          en: 'Pete had talked to Lena and knew the mob was after her. He suspects Mickey took her into protection once he found out, but he isn\'t sure.',
        },
        hiddenSecret: {
          tr: 'Aslında Mickey ona "Lena\'yı saklıyorum" dedi. Ama korkudan söylemiyor. Dövülmesi mafyadan, Mickey\'den değil.',
          en: 'Mickey actually told him "I\'m hiding Lena." But he\'s too scared to say so. The beating came from the mob, not Mickey.',
        },
        isCulprit: false,
      },
    ],
    items: [
      {
        id: 'case_file',
        name: 'Dava Dosyası',
        description: {
          tr: 'Kaba kahverengi kapaklı bir dosya. İçinde Lena Hart\'ın fotoğrafı, son performansının tarihi, aileden kimse aramıyor notu.',
          en: 'A rough brown folder. Inside: a photograph of Lena Hart, the date of her last performance, a note that no family has been looking.',
        },
        roomId: 'detective_office',
        isEvidence: false,
        isRedHerring: false,
      },
      {
        id: 'matchbook',
        name: 'Kibrit Kutusu',
        description: {
          tr: 'Velvet Lounge logolu kırmızı bir kibrit kutusu. İç kapağında kurşun kalemle tek bir kelime: "Malone".',
          en: 'A red matchbook with the Velvet Lounge logo. Inside the cover, in pencil, a single word: "Malone".',
        },
        roomId: 'velvet_lounge',
        isEvidence: true,
        isRedHerring: false,
      },
      {
        id: 'broken_necklace',
        name: 'Kopmuş Kolye',
        description: {
          tr: 'Gümüş bir kolye, zinciri sertçe çekilerek kopmuş. Yere düşmüş gibi değil, koparılmış.',
          en: 'A silver necklace, chain snapped from a hard pull. Not dropped — torn off.',
        },
        roomId: 'backstage',
        isEvidence: true,
        isRedHerring: false,
      },
      {
        id: 'singers_diary',
        name: 'Şarkıcının Günlüğü',
        description: {
          tr: 'Mor deri kapaklı, son sayfası kırmızı mühürlü. Son giriş: "Malone öğrenirse beni de öldürür."',
          en: 'A purple leather diary, its last page sealed with red wax. The final entry: "If Malone finds out, he\'ll kill me too."',
        },
        roomId: 'backstage',
        isEvidence: true,
        isRedHerring: false,
      },
      {
        id: 'cigarette_butt',
        name: 'Sigara İzmariti',
        description: {
          tr: 'Lucky Strike markalı bir izmarit, yanındaki kana karışmış. Tommy\'nin cebinden düşmüş olabilir — ya da başka birinin.',
          en: 'A Lucky Strike butt, mixed with blood beside it. It could have fallen from Tommy\'s pocket — or someone else\'s.',
        },
        roomId: 'rain_soaked_street',
        isEvidence: false,
        isRedHerring: true,
      },
    ],
    entryScenes,
    openingNarration: {
      tr: 'Yağmur, Lena Hart kaybolduğu geceden beri dinmedi. Velvet Lounge\'un caz şarkıcısı dün gece yarısından sonra kimse tarafından görülmedi. Bu gece beş dedektif aynı soruyu sormak için uyandı — ama farklı kapılardan girdiler. Şehir sabaha kadar bir cevap bekliyor.',
      en: 'The rain hasn\'t let up since the night Lena Hart vanished. The Velvet Lounge\'s jazz singer was last seen just past midnight. Tonight, five detectives wake to ask the same question — but each comes through a different door. The city waits for an answer before dawn.',
    },
    solution: {
      culpritNpcId: 'bartender_mickey',
      motiveShort: {
        tr: 'Lena\'yı mafyadan korumak için kaçırdı, ama planı çöktü ve izleri temizlemeyi başaramadı.',
        en: 'He took Lena to protect her from the mob, but the plan fell apart and he couldn\'t cover his tracks.',
      },
      keyEvidenceId: 'matchbook',
    },
  };
}
