export type SupportedLanguage = 'en' | 'lv' | 'de' | 'ru' | 'lt' | 'et';

export interface SurveyTranslations {
  // Age selection
  selectAgeGroup: string;
  ageGroupDescription: string;
  ageGroup1: string;
  ageGroup2: string;
  ageGroup3: string;
  gdprNotice: string;
  skipSurvey: string;

  // Questions
  questionOf: (current: number, total: number) => string;
  previous: string;
  next: string;
  submit: string;

  // States
  submitting: string;
  thankYou: string;
  responsesRecorded: string;

  // Likert scale
  stronglyDisagree: string;
  disagree: string;
  neutral: string;
  agree: string;
  stronglyAgree: string;

  // Yes / No
  yes: string;
  no: string;
}

export const surveyLocales: Record<SupportedLanguage, SurveyTranslations> = {
  en: {
    selectAgeGroup: 'Select Your Age Group',
    ageGroupDescription: 'This helps us understand different perspectives',
    ageGroup1: '7–12 years',
    ageGroup2: '13–18 years',
    ageGroup3: '19+ years',
    gdprNotice:
      'We collect this data anonymously for research purposes to improve our services in compliance with EU data protection regulations (GDPR). Your personal information is not stored.',
    skipSurvey: 'Skip Survey',
    questionOf: (c, t) => `Question ${c} of ${t}`,
    previous: 'Previous',
    next: 'Next',
    submit: 'Submit',
    submitting: 'Submitting your responses…',
    thankYou: 'Thank You!',
    responsesRecorded: 'Your responses have been recorded.',
    stronglyDisagree: 'Strongly\nDisagree',
    disagree: 'Disagree',
    neutral: 'Neutral',
    agree: 'Agree',
    stronglyAgree: 'Strongly\nAgree',
    yes: 'Yes',
    no: 'No',
  },
  lv: {
    selectAgeGroup: 'Izvēlieties vecuma grupu',
    ageGroupDescription: 'Tas palīdz mums izprast dažādus viedokļus',
    ageGroup1: '7–12 gadi',
    ageGroup2: '13–18 gadi',
    ageGroup3: '19+ gadi',
    gdprNotice:
      'Mēs apkopojam šos datus anonīmi pētniecības nolūkos, lai uzlabotu mūsu pakalpojumus saskaņā ar ES datu aizsardzības regulām (VDAR). Jūsu personīgā informācija netiek glabāta.',
    skipSurvey: 'Izlaist aptauju',
    questionOf: (c, t) => `Jautājums ${c} no ${t}`,
    previous: 'Iepriekšējais',
    next: 'Tālāk',
    submit: 'Iesniegt',
    submitting: 'Iesniedz atbildes…',
    thankYou: 'Paldies!',
    responsesRecorded: 'Jūsu atbildes ir reģistrētas.',
    stronglyDisagree: 'Pilnīgi\nnepiekrītu',
    disagree: 'Nepiekrītu',
    neutral: 'Neitrāls',
    agree: 'Piekrītu',
    stronglyAgree: 'Pilnīgi\npiekrītu',
    yes: 'Jā',
    no: 'Nē',
  },
  de: {
    selectAgeGroup: 'Altersgruppe auswählen',
    ageGroupDescription: 'Dies hilft uns, verschiedene Perspektiven zu verstehen',
    ageGroup1: '7–12 Jahre',
    ageGroup2: '13–18 Jahre',
    ageGroup3: '19+ Jahre',
    gdprNotice:
      'Wir erheben diese Daten anonym zu Forschungszwecken, um unsere Dienste zu verbessern, in Übereinstimmung mit der EU-Datenschutzgrundverordnung (DSGVO). Ihre persönlichen Daten werden nicht gespeichert.',
    skipSurvey: 'Umfrage überspringen',
    questionOf: (c, t) => `Frage ${c} von ${t}`,
    previous: 'Zurück',
    next: 'Weiter',
    submit: 'Absenden',
    submitting: 'Antworten werden gesendet…',
    thankYou: 'Danke!',
    responsesRecorded: 'Ihre Antworten wurden gespeichert.',
    stronglyDisagree: 'Stimme\ngar nicht zu',
    disagree: 'Stimme\nnicht zu',
    neutral: 'Neutral',
    agree: 'Stimme\nzu',
    stronglyAgree: 'Stimme\nvoll zu',
    yes: 'Ja',
    no: 'Nein',
  },
  ru: {
    selectAgeGroup: 'Выберите возрастную группу',
    ageGroupDescription: 'Это помогает нам понять разные точки зрения',
    ageGroup1: '7–12 лет',
    ageGroup2: '13–18 лет',
    ageGroup3: '19+ лет',
    gdprNotice:
      'Мы собираем эти данные анонимно в исследовательских целях для улучшения наших услуг в соответствии с требованиями ЕС по защите данных (GDPR). Ваша личная информация не хранится.',
    skipSurvey: 'Пропустить опрос',
    questionOf: (c, t) => `Вопрос ${c} из ${t}`,
    previous: 'Назад',
    next: 'Далее',
    submit: 'Отправить',
    submitting: 'Отправка ответов…',
    thankYou: 'Спасибо!',
    responsesRecorded: 'Ваши ответы записаны.',
    stronglyDisagree: 'Полностью\nне согласен',
    disagree: 'Не\nсогласен',
    neutral: 'Нейтрально',
    agree: 'Согласен',
    stronglyAgree: 'Полностью\nсогласен',
    yes: 'Да',
    no: 'Нет',
  },
  lt: {
    selectAgeGroup: 'Pasirinkite amžiaus grupę',
    ageGroupDescription: 'Tai padeda mums suprasti skirtingas perspektyvas',
    ageGroup1: '7–12 metų',
    ageGroup2: '13–18 metų',
    ageGroup3: '19+ metų',
    gdprNotice:
      'Renkame šiuos duomenis anonimiškai tyrimų tikslais, siekdami pagerinti mūsų paslaugas pagal ES duomenų apsaugos reglamentą (BDAR). Jūsų asmeninė informacija nėra saugoma.',
    skipSurvey: 'Praleisti apklausą',
    questionOf: (c, t) => `Klausimas ${c} iš ${t}`,
    previous: 'Atgal',
    next: 'Toliau',
    submit: 'Pateikti',
    submitting: 'Siunčiami atsakymai…',
    thankYou: 'Ačiū!',
    responsesRecorded: 'Jūsų atsakymai užregistruoti.',
    stronglyDisagree: 'Visiškai\nnesutinku',
    disagree: 'Nesutinku',
    neutral: 'Neutralu',
    agree: 'Sutinku',
    stronglyAgree: 'Visiškai\nsutinku',
    yes: 'Taip',
    no: 'Ne',
  },
  et: {
    selectAgeGroup: 'Valige vanuserühm',
    ageGroupDescription: 'See aitab meil mõista erinevaid vaatenurki',
    ageGroup1: '7–12 aastat',
    ageGroup2: '13–18 aastat',
    ageGroup3: '19+ aastat',
    gdprNotice:
      'Kogume neid andmeid anonüümselt uurimistöö eesmärgil, et parandada meie teenuseid vastavalt EL-i andmekaitsenõuetele (GDPR). Teie isikuandmeid ei talletata.',
    skipSurvey: 'Jäta küsitlus vahele',
    questionOf: (c, t) => `Küsimus ${c} / ${t}`,
    previous: 'Eelmine',
    next: 'Järgmine',
    submit: 'Esita',
    submitting: 'Vastuste saatmine…',
    thankYou: 'Tänan!',
    responsesRecorded: 'Teie vastused on salvestatud.',
    stronglyDisagree: 'Ei nõustu\nüldse',
    disagree: 'Ei\nnõustu',
    neutral: 'Neutraalne',
    agree: 'Nõustun',
    stronglyAgree: 'Nõustun\ntäielikult',
    yes: 'Jah',
    no: 'Ei',
  },
};

export function getTranslations(language?: string): SurveyTranslations {
  const lang = (language as SupportedLanguage) || 'en';
  return surveyLocales[lang] ?? surveyLocales.en;
}
