"use client";

import { useState } from "react";
import { BookMarked, Moon, Sun, Shield, GraduationCap, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface Dua {
  arabic: string;
  transliteration: string;
  translation: string;
  source: string;
}

interface Category {
  id: string;
  label: string;
  labelAr: string;
  icon: React.ReactNode;
  duas: Dua[];
}

const categories: Category[] = [
  {
    id: "morning",
    label: "Morning",
    labelAr: "الصباح",
    icon: <Sun className="w-4 h-4" />,
    duas: [
      {
        arabic: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ",
        transliteration: "Aṣbaḥnā wa aṣbaḥa al-mulku lillāh, wal-ḥamdu lillāh, lā ilāha illallāhu waḥdahu lā sharīka lah, lahul-mulku wa lahul-ḥamdu wa huwa 'alā kulli shay'in qadīr.",
        translation: "We have reached the morning and at this very time the dominion belongs to Allah. All praise is for Allah. None has the right to be worshipped but Allah, alone, without partner. To Him belongs the dominion, to Him belongs all praise, and He is over all things omnipotent.",
        source: "Muslim 4/2088",
      },
      {
        arabic: "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ",
        transliteration: "Allāhumma bika aṣbaḥnā, wa bika amsaynā, wa bika naḥyā, wa bika namūtu, wa ilayka an-nushūr.",
        translation: "O Allah, by Your leave we have reached the morning and by Your leave we have reached the evening, by Your leave we live and die and unto You is our resurrection.",
        source: "Tirmidhi 3391",
      },
      {
        arabic: "سُبْحَانَ اللهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ",
        transliteration: "Subḥānallāhi wa biḥamdihī, 'adada khalqih, wa riḍā nafsih, wa zinata 'arshih, wa midāda kalimātih.",
        translation: "Glory and praise be to Allah, as many times as the number of His creatures, in accordance with His Good Pleasure, equal to the weight of His Throne and equal to the ink that may be used in recording the words.",
        source: "Muslim 4/2090",
      },
      {
        arabic: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ",
        transliteration: "Allāhumma anta rabbī lā ilāha illā ant, khalaqtanī wa anā 'abduk, wa anā 'alā 'ahdika wa wa'dika mā istaṭa't.",
        translation: "O Allah, You are my Lord, none has the right to be worshipped except You. You created me and I am Your servant, following Your covenant and my promise to You as much as I am able.",
        source: "Bukhari 8/318 — Sayyid al-Istighfar",
      },
    ],
  },
  {
    id: "evening",
    label: "Evening",
    labelAr: "المساء",
    icon: <Moon className="w-4 h-4" />,
    duas: [
      {
        arabic: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ",
        transliteration: "Amsaynā wa amsal-mulku lillāh, walḥamdu lillāh, lā ilāha illallāhu waḥdahu lā sharīka lah.",
        translation: "We have reached the evening and at this very time the dominion belongs to Allah. All praise is for Allah. None has the right to be worshipped but Allah, alone, without partner.",
        source: "Muslim 4/2088",
      },
      {
        arabic: "اللَّهُمَّ بِكَ أَمْسَيْنَا وَبِكَ أَصْبَحْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ",
        transliteration: "Allāhumma bika amsaynā wa bika aṣbaḥnā wa bika naḥyā wa bika namūtu wa ilayk al-maṣīr.",
        translation: "O Allah, by Your leave we have reached the evening and by Your leave we have reached the morning, by Your leave we live and die and unto You is our return.",
        source: "Tirmidhi 3391",
      },
      {
        arabic: "اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ",
        transliteration: "Allāhumma 'āfinī fī badanī, Allāhumma 'āfinī fī sam'ī, Allāhumma 'āfinī fī baṣarī, lā ilāha illā ant.",
        translation: "O Allah, grant my body health. O Allah, grant my hearing health. O Allah, grant my sight health. None has the right to be worshipped but You.",
        source: "Abu Dawud 4/324",
      },
      {
        arabic: "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ",
        transliteration: "A'ūdhu bikalimātillāhi at-tāmmāti min sharri mā khalaq.",
        translation: "I seek refuge in the perfect words of Allah from the evil of what He has created.",
        source: "Muslim 4/2080",
      },
    ],
  },
  {
    id: "prayer",
    label: "Prayer",
    labelAr: "الصلاة",
    icon: <BookMarked className="w-4 h-4" />,
    duas: [
      {
        arabic: "اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ",
        transliteration: "Allāhumma aj'alnī min at-tawwābīn waj'alnī min al-mutaṭahhirīn.",
        translation: "O Allah, make me among those who repent and make me among those who purify themselves.",
        source: "Tirmidhi 55 — after wudu",
      },
      {
        arabic: "اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلَاةِ الْقَائِمَةِ، آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ",
        transliteration: "Allāhumma Rabba hādhihi ad-da'watit-tāmmah, was-ṣalātil qā'imah, āti Muḥammadan al-wasīlata wal-faḍīlah.",
        translation: "O Allah, Lord of this perfect call and established prayer. Grant Muhammad the intercession and superiority.",
        source: "Bukhari 1/152 — after adhan",
      },
      {
        arabic: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبَارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَلَا إِلَهَ غَيْرُكَ",
        transliteration: "Subḥānaka Allāhumma wa biḥamdik, wa tabārak asmuk, wa ta'ālā jadduk, wa lā ilāha ghayruk.",
        translation: "Glory be to You, O Allah, and all praise. Blessed is Your Name and Exalted is Your Majesty. There is none worthy of worship but You.",
        source: "Abu Dawud 1/775 — opening of prayer",
      },
      {
        arabic: "رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِنْ ذُرِّيَّتِي رَبَّنَا وَتَقَبَّلْ دُعَاءِ",
        transliteration: "Rabbij'alnī muqīmaṣ-ṣalāti wa min dhurriyyatī, Rabbanā wa taqabbal du'ā'.",
        translation: "My Lord, make me an establisher of prayer, and from my descendants. Our Lord, and accept my supplication.",
        source: "Quran 14:40",
      },
    ],
  },
  {
    id: "protection",
    label: "Protection",
    labelAr: "الحماية",
    icon: <Shield className="w-4 h-4" />,
    duas: [
      {
        arabic: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ",
        transliteration: "Bismillāhil-ladhī lā yaḍurru ma'asmihi shay'un fil-arḍi wa lā fis-samā'i wa huwas-samī'ul-'alīm.",
        translation: "In the name of Allah with whose name nothing can cause harm on earth or in the heavens, and He is the All-Hearing, the All-Knowing.",
        source: "Abu Dawud 4/323 — 3x morning & evening",
      },
      {
        arabic: "أَعُوذُ بِاللَّهِ السَّمِيعِ الْعَلِيمِ مِنَ الشَّيْطَانِ الرَّجِيمِ",
        transliteration: "A'ūdhu billāhis-samī'il-'alīmi minash-shayṭānir-rajīm.",
        translation: "I seek refuge with Allah, the All-Hearing, the All-Knowing, from the accursed devil.",
        source: "Tirmidhi 5/524",
      },
      {
        arabic: "حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ",
        transliteration: "Ḥasbiyallāhu lā ilāha illā huwa 'alayhi tawakkaltu wa huwa Rabbul-'arshil-'aẓīm.",
        translation: "Allah is sufficient for me; there is no god but He; in Him I place my trust and He is the Lord of the Mighty Throne.",
        source: "Quran 9:129 — 7x morning & evening",
      },
      {
        arabic: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَأَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ",
        transliteration: "Allāhumma innī a'ūdhu bika minal-hammi wal-ḥazan, wa a'ūdhu bika minal-'ajzi wal-kasal.",
        translation: "O Allah, I seek refuge in You from anxiety and sorrow, and I seek refuge in You from incapacity and laziness.",
        source: "Bukhari 8/154",
      },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    labelAr: "العلم",
    icon: <GraduationCap className="w-4 h-4" />,
    duas: [
      {
        arabic: "رَبِّ زِدْنِي عِلْمًا",
        transliteration: "Rabbi zidnī 'ilmā.",
        translation: "My Lord, increase me in knowledge.",
        source: "Quran 20:114",
      },
      {
        arabic: "اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا",
        transliteration: "Allāhumma infa'nī bimā 'allamtanī, wa 'allimnī mā yanfa'unī, wa zidnī 'ilmā.",
        translation: "O Allah, benefit me with what You have taught me, and teach me what will benefit me, and increase me in knowledge.",
        source: "Tirmidhi 5/742",
      },
      {
        arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا",
        transliteration: "Allāhumma innī as'aluka 'ilman nāfi'ā, wa rizqan ṭayyibā, wa 'amalan mutaqabbalā.",
        translation: "O Allah, I ask You for beneficial knowledge, pure provision, and accepted deeds.",
        source: "Ibn Majah 1/152 — after Fajr",
      },
      {
        arabic: "سُبْحَانَكَ لَا عِلْمَ لَنَا إِلَّا مَا عَلَّمْتَنَا إِنَّكَ أَنْتَ الْعَلِيمُ الْحَكِيمُ",
        transliteration: "Subḥānaka lā 'ilma lanā illā mā 'allamtanā innaka anta al-'alīmul-ḥakīm.",
        translation: "Glory be to You, we have no knowledge except what You have taught us. Verily, it is You, the All-Knower, the All-Wise.",
        source: "Quran 2:32",
      },
    ],
  },
  {
    id: "gratitude",
    label: "Gratitude",
    labelAr: "الشكر",
    icon: <Heart className="w-4 h-4" />,
    duas: [
      {
        arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ",
        transliteration: "Al-ḥamdu lillāhil-ladhī aṭ'amanī hādhā wa razaqanīhi min ghayri ḥawlin minnī wa lā quwwah.",
        translation: "All praise is to Allah who fed me this and provided it for me without any might or power on my part.",
        source: "Abu Dawud — after eating",
      },
      {
        arabic: "اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ نُورُ السَّمَاوَاتِ وَالأَرْضِ وَمَنْ فِيهِنَّ",
        transliteration: "Allāhumma lakal-ḥamdu anta nūrus-samāwāti wal-arḍi wa man fīhinn.",
        translation: "O Allah, all praise is due to You. You are the Light of the heavens and the earth and all that is in them.",
        source: "Bukhari 8/75",
      },
      {
        arabic: "اللَّهُمَّ مَا أَصْبَحَ بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ",
        transliteration: "Allāhumma mā aṣbaḥa bī min ni'matin aw bi-aḥadin min khalqika faminka waḥdaka lā sharīka laka falakal-ḥamdu wa lakash-shukr.",
        translation: "O Allah, whatever blessing I or any of Your creation have risen upon, it is from You alone, without partner. So for You is all praise and unto You all thanks.",
        source: "Abu Dawud 4/318",
      },
      {
        arabic: "رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَى وَالِدَيَّ",
        transliteration: "Rabbi awzi'nī an ashkura ni'matakal-latī an'amta 'alayya wa 'alā wālidayya.",
        translation: "My Lord, inspire me to be grateful for Your favor which You have bestowed upon me and upon my parents.",
        source: "Quran 27:19",
      },
    ],
  },
];

export default function DuasPage() {
  const [activeTab, setActiveTab] = useState("morning");

  const active = categories.find((c) => c.id === activeTab) ?? categories[0];

  return (
    <div className="page max-w-4xl">
      {/* Header */}
      <div>
        <p className="section-label mb-1">Dhikr & Supplication</p>
        <h1 className="text-2xl font-bold heading-gradient" style={{ fontFamily: "var(--font-heading)" }}>Duas & Dhikr</h1>
        <p className="text-2xl font-light text-[var(--emerald)] mt-1" dir="rtl" style={{ fontFamily: "serif" }}>
          أذكار
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
              activeTab === cat.id
                ? "bg-[var(--emerald)]/20 text-[var(--emerald)] border border-[var(--emerald)]/40"
                : "bg-card border border-white/6 text-muted-foreground hover:text-foreground hover:border-white/12"
            )}
          >
            {cat.icon}
            <span>{cat.label}</span>
            <span className="text-xs opacity-70" style={{ fontFamily: "serif" }}>{cat.labelAr}</span>
          </button>
        ))}
      </div>

      {/* Duas list */}
      <div className="space-y-4">
        {active.duas.map((dua, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/8 bg-card p-6 space-y-4 relative overflow-hidden"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-[var(--emerald)]/60" />

            {/* Arabic text */}
            <p
              className="text-xl leading-loose text-right font-light tracking-wide text-foreground/90"
              dir="rtl"
              style={{ fontFamily: "serif" }}
            >
              {dua.arabic}
            </p>

            <div className="border-t border-white/6 pt-4 space-y-2">
              {/* Transliteration */}
              <p className="text-sm italic text-muted-foreground leading-relaxed">
                {dua.transliteration}
              </p>

              {/* Translation */}
              <p className="text-sm text-foreground/80 leading-relaxed">
                {dua.translation}
              </p>

              {/* Source */}
              <p className="text-xs text-[var(--emerald)] font-medium pt-1">
                {dua.source}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
