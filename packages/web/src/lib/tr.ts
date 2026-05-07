/**
 * tr.ts — Turkish UI strings for Velvet Shadow
 *
 * Single source of Turkish labels. Keep flat and explicit so components
 * can import exactly what they need without dynamic key lookups.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

export const T = {
  app: {
    title: 'The Velvet Shadow',
    subtitle: 'Çok oyunculu AI hikâye oyunu',
    tagline: '2–10 oyuncu, her seferinde yeni bir hikâye',
  },

  home: {
    createTitle: 'Yeni Oda Aç',
    createHint: 'Hikâyeyi sen başlat, arkadaşlarına kodu gönder',
    createButton: 'Oda Oluştur',
    creating: 'Oluşturuluyor…',
    joinTitle: 'Bir Odaya Katıl',
    joinHint: '6 haneli oda kodunu gir',
    joinPlaceholder: 'ABC123',
    joinButton: 'Katıl',
    joining: 'Katılıyor…',
    signOut: 'Çıkış Yap',
    courseNote: 'COMP 491 · AKBOYS · Bahar 2026',
  },

  multiplayer: {
    noRoom: 'Bu kod ile bir oda bulunamadı',
    invalidCode: 'Lütfen geçerli bir 6 haneli kod yaz',
  },

  lobby: {
    roomCodeLabel: 'Oda Kodu',
    waitingForPlayers: 'Oyuncular bekleniyor…',
    waitingForHost: 'Host hikayeyi hazırlıyor…',
    playersTitle: 'Oyuncular',
    youLabel: '(sen)',
    hostLabel: '(host)',
    promptTitle: 'Nasıl Bir Hikaye İstersin?',
    promptSubtitle: 'Bir tema yaz ya da aşağıdaki önerilerden birini seç. AI dünyayı senin için yaratacak.',
    promptPlaceholder: 'Örnek: 1927 Chicago\'da kayıp bir caz şarkıcısı…',
    promptSurprise: 'Sürpriz olsun',
    presets: [
      '1927 Chicago — Velvet Lounge\'da kayıp bir şarkıcı',
      'Antarktika araştırma üssü — Bir bilim insanı ortadan kayboldu',
      'Uluslararası Uzay İstasyonu — Mürettebat arasında bir katil var',
      'Ortaçağ kalesi — Kral ziyafette zehirlendi',
    ],
    createStory: 'Hikayeyi Oluştur',
    generating: 'Hikaye yazılıyor…',
    shareLink: 'Bağlantıyı Kopyala',
  },

  opening: {
    skip: 'Geç',
    continue: 'Devam Et',
    start: 'Hikayeye Başla',
    loading: 'Sahne hazırlanıyor…',
    imageLoading: 'Görsel hazırlanıyor…',
  },

  game: {
    turnsLabel: 'Tur',
    mapLabel: 'Harita',
    commLabel: 'Telsiz',
    leave: 'Ayrıl',
    accuse: 'Suçla',
    sendPlaceholder: 'Ne yapıyorsun?',
    send: 'Gönder',
    narratorWriting: 'Anlatıcı yazıyor…',
    waitingForOthers: 'Diğer oyuncuların cevap vermesi bekleniyor…',
    typing: 'yazıyor',
  },

  minimap: {
    title: 'Harita',
    youAreHere: 'Buradasın',
    unknownRoom: 'Bilinmeyen oda',
    visited: 'Ziyaret edildi',
    unvisited: 'Henüz gidilmedi',
  },

  comm: {
    title: 'Telsiz',
    roomTab: 'Bu Oda',
    directTab: 'Direkt',
    placeholder: 'Mesaj yaz…',
    noMessages: 'Henüz bir mesaj yok',
  },

  accuse: {
    title: 'Suçlama Öner',
    subtitle: 'Kimin yaptığını düşünüyorsun ve hangi kanıtla?',
    suspect: 'Şüpheli',
    evidence: 'Anahtar Kanıt',
    cancel: 'Vazgeç',
    propose: 'Suçlamayı Öner',
    youAccused: 'takıma sesleniyor',
    voteTitle: 'Takım Kararı',
    voteQuestion: 'Hemfikir misin?',
    voteYes: 'Evet, o yaptı',
    voteNo: 'Hayır, o değil',
    voted: 'Oyunu kullandın',
    waitingForTeam: 'Diğer oyuncuların oyu bekleniyor…',
    unanimousRequired: 'Oybirliği gerekli — biri bile hayır derse dava kapanmaz.',
    timeLeft: 'kalan saniye',
    result: {
      won: 'Dava Çözüldü',
      lost_wrong: 'Dava Kaybedildi',
      lost_timeout: 'İzler Soğudu',
    },
  },

  finale: {
    connecting: 'Finalin müziği hazırlanıyor…',
    loading: 'Hikaye bitirişini yazıyor…',
    home: 'Ana Sayfaya Dön',
    playAgain: 'Tekrar Oyna',
    revealTitle: 'Gerçekte Ne Oldu',
    foundLabel: 'Bulunan Kanıtlar',
    missedLabel: 'Kaçırılan Kanıtlar',
    timeline: 'Takımın Yolculuğu',
  },

  login: {
    title: 'Giriş Yap',
    google: 'Google ile Giriş Yap',
    privacy: 'Girişin yalnızca oyun oturumları için kullanılır.',
  },

  name: {
    title: 'Kimsin, dedektif?',
    subtitle: 'Takım arkadaşlarının seni nasıl tanıyacağını yaz.',
    placeholder: 'Adını yaz…',
    save: 'Kaydet',
    change: 'İsmini Değiştir',
  },

  errors: {
    generic: 'Bir şeyler ters gitti',
    sessionNotFound: 'Oturum bulunamadı',
    generating: 'Hikaye oluşturulamadı',
    voteError: 'Oy verilemedi',
    networkError: 'Bağlantı sorunu',
  },

  ambient: {
    musicOn: 'Müzik açık',
    musicOff: 'Müzik kapalı',
  },

  audio: {
    settings: 'Ses Ayarları',
    ambient: 'Atmosfer Müziği',
    sfx: 'Ses Efektleri',
    mute: 'Sustur',
    unmute: 'Aç',
    open: 'Ses ayarları',
    close: 'Kapat',
  },

  reconstruction: {
    cta: 'Olay Yerini Yeniden Canlandır',
    loading: 'Gerçek olaylar bir araya getiriliyor…',
    failed: 'Olay zinciri çıkarılamadı.',
    retry: 'Tekrar Dene',
    title: 'Gerçekte Ne Oldu',
    culpritBadge: 'Katilin hareketi',
    autoplay: 'Otomatik Oynat',
    pause: 'Duraklat',
    next: 'Sonraki',
    prev: 'Önceki',
    close: 'Kapat',
    eventOf: 'Olay {n} / {total}',
    conclusionTitle: 'Sonuç',
  },
} as const;
