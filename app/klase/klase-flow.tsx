'use client';

import { useState } from 'react';

type ParentViewer = { id: string; name: string };

type RegistrationResult = {
  viewerLink: string;
  pin: string;
  shortCode: string;
  classroomName: string;
  modelCount: number;
  worksheetHtml: string;
  mode: 'standard' | 'autodetect';
};

type LangCode = 'en' | 'lv' | 'lt';

const LANG_OPTIONS: { code: LangCode; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'lv', flag: '🇱🇻', label: 'Latviešu' },
  { code: 'lt', flag: '🇱🇹', label: 'Lietuvių' },
];

const UI: Record<LangCode, {
  langLabel: string;
  schoolName: string; schoolPlaceholder: string;
  teacherName: string; teacherPlaceholder: string;
  email: string; emailPlaceholder: string;
  studentCount: string; studentCountHint: string;
  museumDisplay: string;
  noViewers: string;
  submit: string; submitting: string;
  errorFallback: string;
  successSubtitle: (count: number) => string;
  arucoNote: string;
  displayLinkLabel: string;
  pinLabel: string; pinHint: string;
  openPrint: string;
  downloadPdf: string;
  emailSent: (email: string) => string;
  registerAnother: string;
  howItWorks: string;
  consentText: string;
}> = {
  en: {
    langLabel: 'Worksheet language',
    schoolName: 'School name', schoolPlaceholder: 'Springfield Elementary',
    teacherName: 'Teacher name', teacherPlaceholder: 'Jane Smith',
    email: 'Email', emailPlaceholder: 'jane@school.com',
    studentCount: 'Number of students', studentCountHint: 'Print the worksheets yourself in the required quantity.',
    museumDisplay: 'Museum display',
    noViewers: 'No museum displays available. Please contact an administrator.',
    submit: 'Register class and get worksheets', submitting: 'Processing…',
    errorFallback: 'An error occurred. Please try again.',
    successSubtitle: (n) => `Registration successful! ${n} worksheet${n === 1 ? '' : 's'} ready to print.`,
    arucoNote: 'Each worksheet has unique ArUco markers. One QR code leads to a shared upload page — the system will detect which model the photo belongs to.',
    displayLinkLabel: 'Classroom display link',
    pinLabel: 'PIN code to open the display', pinHint: 'Save this PIN — it will not be shown again.',
    openPrint: 'Open & print worksheets',
    downloadPdf: 'Download PDF',
    emailSent: (email: string) => `Worksheets PDF has been sent to ${email}`,
    registerAnother: '← Register another class',
    howItWorks: 'How does it work?',
    consentText: 'I consent to my anonymized data (generated 3D texture and survey responses) being stored and used for academic research and application (UX) improvement. No personal data is collected.',
  },
  lv: {
    langLabel: 'Darba lapu valoda',
    schoolName: 'Skolas nosaukums', schoolPlaceholder: 'Rīgas 1. vidusskola',
    teacherName: 'Skolotāja vārds', teacherPlaceholder: 'Anna Bērziņa',
    email: 'E-pasts', emailPlaceholder: 'anna@skola.lv',
    studentCount: 'Skolēnu skaits', studentCountHint: 'Darba lapas jāizdrukā pašam skolotājam vajadzīgajā daudzumā.',
    museumDisplay: 'Muzeja displejs',
    noViewers: 'Nav pieejamu muzeja displeju. Lūdzu sazinieties ar administratoru.',
    submit: 'Reģistrēt klasi un iegūt darba lapas', submitting: 'Apstrādā…',
    errorFallback: 'Kļūda. Lūdzu mēģiniet vēlreiz.',
    successSubtitle: (n) => `Reģistrācija veiksmīga! ${n} darba ${n === 1 ? 'lapa' : 'lapas'} gatava drukāšanai.`,
    arucoNote: 'Katrai darba lapai ir unikāli ArUco marķieri. Viens QR kods ved uz vienu kopēju augšupielādes lapu — sistēma pati noteiks, kuram modelim attēls pieder.',
    displayLinkLabel: 'Klases displeja saite',
    pinLabel: 'PIN kods displeja atvēršanai', pinHint: 'Saglabājiet šo PIN — tā netiks parādīts vēlreiz.',
    openPrint: 'Atvērt & izdrukāt darba lapas',
    downloadPdf: 'Lejupielādēt PDF',
    emailSent: (email: string) => `Darba lapas PDF ir nosūtītas uz ${email}`,
    registerAnother: '← Reģistrēt citu klasi',
    howItWorks: 'Kā tas darbojas?',
    consentText: 'Es piekrītu, ka mani anonīmie dati (radītā 3D tekstūra un atbildes) tiek saglabāti un izmantoti akadēmiskajos pētījumos, kā arī lietotnes lietotāju pieredzes (UX) uzlabošanai. Personas dati netiek ievākti.',
  },
  lt: {
    langLabel: 'Darbo lapų kalba',
    schoolName: 'Mokyklos pavadinimas', schoolPlaceholder: 'Vilniaus 1-oji gimnazija',
    teacherName: 'Mokytojo vardas', teacherPlaceholder: 'Ona Petrauskienė',
    email: 'El. paštas', emailPlaceholder: 'ona@mokykla.lt',
    studentCount: 'Mokinių skaičius', studentCountHint: 'Darbo lapus spausdina pats mokytojas reikiamu kiekiu.',
    museumDisplay: 'Muziejaus ekranas',
    noViewers: 'Nėra muziejaus ekranų. Susisiekite su administratoriumi.',
    submit: 'Registruoti klasę ir gauti darbo lapus', submitting: 'Apdorojama…',
    errorFallback: 'Klaida. Bandykite dar kartą.',
    successSubtitle: (n) => `Registracija sėkminga! ${n} darbo ${n === 1 ? 'lapas' : 'lapai'} paruošti spausdinimui.`,
    arucoNote: 'Kiekvienas darbo lapas turi unikalius ArUco žymeklius. Vienas QR kodas nukreipia į bendrą įkėlimo puslapį — sistema pati nustatys, kuriam modeliui priklauso nuotrauka.',
    displayLinkLabel: 'Klasės ekrano nuoroda',
    pinLabel: 'PIN kodas ekranui atidaryti', pinHint: 'Išsaugokite šį PIN — jis daugiau nebus rodomas.',
    openPrint: 'Atidaryti ir spausdinti darbo lapus',
    downloadPdf: 'Atsisiųsti PDF',
    emailSent: (email: string) => `Darbo lapų PDF išsiųstas į ${email}`,
    registerAnother: '← Registruoti kitą klasę',
    howItWorks: 'Kaip tai veikia?',
    consentText: 'Sutinku, kad mano anonimizuoti duomenys (sukurta 3D tekstūra ir apklausos atsakymai) būtų saugomi ir naudojami akademiniams tyrimams bei programėlės (UX) tobulinimui. Jokie asmens duomenys nėra renkami.',
  },
};

const INSTRUCTIONS: Record<LangCode, { title: string; steps: { icon: string; heading: string; body: string }[] }> = {
  lv: {
    title: 'Kā lietot?',
    steps: [
      {
        icon: '📝',
        heading: 'Reģistrējiet klasi',
        body: 'Aizpildiet formu ar skolas nosaukumu, skolotāja vārdu un skolnieku skaitu.',
      },
      {
        icon: '🖨️',
        heading: 'Izdrukājiet darba lapas',
        body: 'Pēc reģistrācijas lejupielādējiet PDF vai atveriet darba lapas un izdrukājiet — vienu katram skolniekam.',
      },
      {
        icon: '🎨',
        heading: 'Skolnieki izkrāso',
        body: 'Kad darba lapas kontūrzimējums ir izkrāsots, skenējiet QR kodu uz darba lapas, lai nofotogrāfētu izkrāsoto kontūrzimējumu ar stūros esošajiem marķieriem un augšupielādētu foto.',
      },
      {
        icon: '📺',
        heading: 'Atveriet klases displeju',
        body: 'Izmantojiet reģistrācijā saņemto saiti (piem., claypixels.eu/v/xxxx), ievadiet PIN kodu. Katra skolnieka augšupielādētā tekstūra parādīsies uz jūsu klases displeja un arī uz displeja muzejā.',
      },
    ],
  },
  en: {
    title: 'How to use?',
    steps: [
      {
        icon: '📝',
        heading: 'Register your class',
        body: 'Fill in the form with your school name, teacher name and the number of students.',
      },
      {
        icon: '🖨️',
        heading: 'Print the worksheets',
        body: 'After registration, download the PDF or open and print the worksheets — one per student.',
      },
      {
        icon: '🎨',
        heading: 'Students colour in',
        body: 'Once the worksheet outline is coloured in, scan the QR code on the worksheet to photograph the coloured drawing with the corner markers and upload the photo.',
      },
      {
        icon: '📺',
        heading: 'Open the classroom display',
        body: 'Use the link received after registration (e.g. claypixels.eu/v/xxxx), enter the PIN code. Each student’s uploaded texture will appear on your classroom display and also on the museum display.',
      },
    ],
  },
  lt: {
    title: 'Kaip naudoti?',
    steps: [
      {
        icon: '📝',
        heading: 'Registruokite klasę',
        body: 'Užpildykite formą su mokyklos pavadinimu, mokytojo vardu ir mokinų skaičiumi.',
      },
      {
        icon: '🖨️',
        heading: 'Išspausdinkite darbo lapus',
        body: 'Po registracijos atsisiųskite PDF arba atidarykite darbo lapus ir išspausdinkite — po vieną kiekvienam mokiniui.',
      },
      {
        icon: '🎨',
        heading: 'Mokiniai nudažo',
        body: 'Kai darbo lapo kontūrinis piešinys yra nudažytas, nuskenukite QR kodą ant darbo lapo, kad nufotografuotumėte nudažytą piešinį su kampųose esančiais žymekliais ir įkeltumėte nuotrauką.',
      },
      {
        icon: '📺',
        heading: 'Atidarykite klasės ekraną',
        body: 'Naudokite po registracijos gautą nuorodą (pvz. claypixels.eu/v/xxxx), įveskite PIN kodą. Kiekvieno mokinio įkelta tekstūra bus rodoma jūsų klasės ekrane ir taip pat muziejaus ekrane.',
      },
    ],
  },
};

export function KlaseFlow({ parentViewers }: { parentViewers: ParentViewer[] }) {
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [lang, setLang] = useState<LangCode>('lv');

  const t = UI[lang];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      school_name: form.get('school_name'),
      teacher_name: form.get('teacher_name'),
      teacher_email: form.get('teacher_email'),
      child_count: form.get('child_count'),
      parent_viewer_id: form.get('parent_viewer_id'),
      mode: 'autodetect',
      lang,
    };

    try {
      const res = await fetch('/api/klase/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.errorFallback);
      setSubmittedEmail((payload.teacher_email as string) || '');
      setResult(data);
    } catch (err: any) {
      setError(err.message || t.errorFallback);
    } finally {
      setLoading(false);
    }
  }

  function openWorksheets() {
    if (!result) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(result.worksheetHtml);
    win.document.close();
    setTimeout(() => win.print(), 800);
  }

  async function downloadPdf() {
    if (!result) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: result.worksheetHtml }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'PDF generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.classroomName.replace(/[^a-zA-Z0-9-_ ]/g, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'PDF generation failed');
    } finally {
      setPdfLoading(false);
    }
  }

  if (result) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{result.classroomName}</h2>
        </div>

        {/* Print worksheets */}
        <button
          onClick={downloadPdf}
          disabled={pdfLoading}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-400 text-white font-semibold py-4 rounded-xl transition-colors"
        >
          {pdfLoading ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Generating PDF…
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              {t.downloadPdf}
            </>
          )}
        </button>

        {submittedEmail ? (
          <p className="text-center text-sm text-green-700 bg-green-50 rounded-xl px-4 py-2">
            {t.emailSent(submittedEmail)}
          </p>
        ) : null}

        <button
          onClick={() => setResult(null)}
          className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
        >
          {t.registerAnother}
        </button>
      </div>
    );
  }

  const instr = INSTRUCTIONS[lang];

  return (
    <div className="space-y-4">
      {/* How it works — collapsible */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowInstructions(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="font-semibold text-gray-800 flex items-center gap-2">
            {t.howItWorks}
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showInstructions ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showInstructions && (
          <div className="px-6 pb-6 border-t border-gray-100">
            <h3 className="font-bold text-gray-900 mt-4 mb-4 text-base">{instr.title}</h3>
            <ol className="space-y-4">
              {instr.steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="font-semibold text-gray-800 text-sm mb-0.5">
                      {step.heading}
                    </p>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
      {/* Language selector */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">
          {t.langLabel} <span className="text-red-500">*</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LANG_OPTIONS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={[
                'flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 transition-all text-sm',
                lang === l.code
                  ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300',
              ].join(' ')}
            >
              <span className="text-2xl leading-none">{l.flag}</span>
              <span className="text-xs font-medium">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* School name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="school_name">
          {t.schoolName} <span className="text-red-500">*</span>
        </label>
        <input
          id="school_name"
          name="school_name"
          type="text"
          required
          placeholder={t.schoolPlaceholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      {/* Teacher name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="teacher_name">
          {t.teacherName}
        </label>
        <input
          id="teacher_name"
          name="teacher_name"
          type="text"
          placeholder={t.teacherPlaceholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      {/* Teacher email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="teacher_email">
          {t.email}
        </label>
        <input
          id="teacher_email"
          name="teacher_email"
          type="email"
          placeholder={t.emailPlaceholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>

      {/* Child count */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="child_count">
          {t.studentCount} <span className="text-red-500">*</span>
        </label>
        <input
          id="child_count"
          name="child_count"
          type="number"
          min={1}
          max={60}
          defaultValue={25}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <p className="text-xs text-gray-500 mt-1">{t.studentCountHint}</p>
      </div>

      {/* Museum viewer picker */}
      {parentViewers.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="parent_viewer_id">
            {t.museumDisplay} <span className="text-red-500">*</span>
          </label>
          <select
            id="parent_viewer_id"
            name="parent_viewer_id"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
          >
            {parentViewers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {parentViewers.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          {t.noViewers}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Consent checkbox */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 w-4 h-4 flex-shrink-0 accent-gray-900 cursor-pointer"
        />
        <span className="text-sm text-gray-600 leading-snug">
          {t.consentText}
          <span className="text-red-500 ml-0.5">*</span>
        </span>
      </label>

      <button
        type="submit"
        disabled={loading || parentViewers.length === 0}
        className="w-full bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {t.submitting}
          </>
        ) : (
          t.submit
        )}
      </button>
    </form>
    </div>
  );
}
