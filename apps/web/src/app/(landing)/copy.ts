import type { Lang } from "@/lib/i18n";

export interface Copy {
  nav: { how: string; demo: string; biz: string; open: string; label: string };
  hero: { pill: string; h1a: string; h1b: string; lead: string; scan: string; code: string; stats: [string, string][]; alt: string };
  quote: [string, string];
  problem: { eb: string; h: string; items: [string, string][]; src: string };
  answer: { eb: string; h: string; items: { tag: string; cls: string; text: string; alt: string; img: string }[]; note: string };
  how: { eb: string; h: string; steps: [string, string][]; alt: string; cap: string };
  video: { h: string; label: string };
  demo: { eb: string; h: string; p: string; qrs: { img: string; alt: string; tag: string; cls: string; cap: string }[]; noPhone: string; link: string; tail: string };
  solana: { eb: string; h: string; items: [string, string][]; p: string };
  biz: { eb: string; h: string; cards: [string, string, string][]; pilotH: string; pilotP: string; subject: string };
  foot: { tag: string; demo: string; other: string; small: string };
}

const EN: Copy = {
  nav: { how: "How it works", demo: "Try it", biz: "For companies", open: "Open the live demo", label: "Main" },
  hero: {
    pill: "Built on Solana · Colosseum 2026",
    h1a: "Is this medicine real? ",
    h1b: "Now anyone can check.",
    lead: "Certapharm gives every medicine box a public proof of origin. Scan the code already printed on the box and get a plain answer in under a second. No wallet, no app, no account.",
    scan: "Scan a demo box",
    code: "View the open-source code",
    stats: [
      ["718 ms", "p95 to verify a box,\nmeasured on the live demo"],
      ["~$0.0001", "per box seal with\ncompressed NFTs"],
      ["0", "wallets or apps\nthe patient needs"],
    ],
    alt: "Certapharm verdict screen showing Authentic for Demo Amoxicilina 500 mg, with its custody trail",
  },
  quote: [
    "“My father bought vitamins that turned out to be counterfeit. He had no way to check. That’s why I built Certapharm.”",
    "Ysrael de Jesus Sacramento, founder · Universidade Federal de Sergipe, Brazil",
  ],
  problem: {
    eb: "The problem",
    h: "Counterfeiters copy the most expensive drugs. Patients can’t tell.",
    items: [
      ["1 in 10", "medicines in low- and middle-income countries is substandard or falsified."],
      ["$30.5B", "spent every year on these products."],
      ["2025–26", "Brazil’s Anvisa seized fake lots of Keytruda, Mounjaro and Enhertu, with copied labels and codes."],
    ],
    src: "Sources: World Health Organization; Anvisa seizure orders.",
  },
  answer: {
    eb: "The answer",
    h: "Scan the box. Get one of three answers.",
    items: [
      { tag: "Authentic", cls: "ok", text: "An accredited maker certified this batch, and every hand-off is signed.", alt: "Authentic verdict screen", img: "d107fad4189a8432d61a11baed31729c" },
      { tag: "Authentic, with alert", cls: "warn", text: "The batch is real, but under recall or a regulator notice. Talk to your pharmacist.", alt: "Authentic with alert verdict screen showing a recall", img: "4ad30cb7807aecdac97b4c08de51b603" },
      { tag: "Not recognized", cls: "bad", text: "No record of this lot, or this box has no seal. Don’t buy or use it. Report it.", alt: "Not recognized verdict screen", img: "409cce308fcb66e81f788aed090dc572" },
    ],
    note: "",
  },
  how: {
    eb: "How it works",
    h: "One signed trail, from factory to pharmacy.",
    steps: [
      ["Accredit", "Certapharm accredits each company in the chain. On-chain we keep a hash of its CNPJ, never the number."],
      ["Certify", "The manufacturer certifies the batch with its own Solana Attestation Service credential. Nobody else can withdraw it."],
      ["Sign custody", "Carrier, distributor and pharmacy each sign their hand-off on Solana, with temperature."],
      ["Seal and verify", "Each box gets a compressed-NFT seal. Anyone verifies with a phone, or audits on the Solana explorer."],
    ],
    alt: "Certapharm manager showing the custody trail for lot L2026E with seven signed events",
    cap: "The manager, live on devnet: each event in the trail links to its Solana transaction.",
  },
  video: { h: "See it in 30 seconds.", label: "Certapharm teaser: the lab certifies, every hand-off is signed, each box is sealed, the patient scans" },
  demo: {
    eb: "Live demo",
    h: "Scan a demo box now.",
    p: "Point your phone camera at any code. Each answer comes straight from Solana devnet. Products are fictitious.",
    qrs: [
      { img: "8eb1907741d8fa55ce9604d14644842c", alt: "QR code for demo lot L2026D", tag: "Authentic", cls: "ok", cap: "Lot L2026D, full custody trail" },
      { img: "6fc7e1e1ef521828d8455bd52e222458", alt: "QR code for demo lot L2026E", tag: "Authentic, with alert", cls: "warn", cap: "Lot L2026E, under recall" },
      { img: "d09b5611b603de5bcdfd620f5d4480dc", alt: "QR code for demo lot L2026X", tag: "Not recognized", cls: "bad", cap: "Lot L2026X, never certified" },
    ],
    noPhone: "No phone at hand? ",
    link: "Type a code in the browser",
    tail: ".",
  },
  solana: {
    eb: "Why Solana",
    h: "Certifying one box has to cost a fraction of a cent.",
    items: [
      ["~$110", "for 1 million unit certificates, with state compression"],
      ["$0.00075", "per signed custody event (5,000 lamports at $150/SOL)"],
      ["718 ms", "p95 to verify a box on the live devnet demo"],
    ],
    p: "Built only on Solana’s own primitives: the Attestation Service, compressed NFTs (Bubblegum) and signed memos. No custom contract to audit, and every claim is public on the explorer.",
  },
  biz: {
    eb: "For companies",
    h: "The supply chain pays. Patients check for free.",
    cards: [
      ["Manufacturers and importers", "Compliance SaaS", "Certify batches, track custody and answer recalls with proof anyone can check."],
      ["High-volume makers", "Per-box seals", "One seal per serial number, so a copied box is rejected even when the lot is real."],
      ["Pharmacy chains", "White-label check", "Give customers a trusted answer at the counter, under your own brand."],
    ],
    pilotH: "Run a pilot with us.",
    pilotP: "We are looking for one importer and one regional pharmacy to pilot Certapharm.",
    subject: "Certapharm%20pilot",
  },
  foot: { tag: "Proof of origin for every medicine box.", demo: "Live demo", other: "Português", small: "Devnet demo with fictitious products · Open source · Built for Colosseum 2026 · © 2026 Certapharm" },
};

const PT: Copy = {
  nav: { how: "Como funciona", demo: "Teste agora", biz: "Para empresas", open: "Abrir a demo", label: "Principal" },
  hero: {
    pill: "Feito na Solana · Colosseum 2026",
    h1a: "Esse remédio é verdadeiro? ",
    h1b: "Agora qualquer pessoa confere.",
    lead: "O Certapharm dá a cada caixa de remédio uma prova pública de origem. Aponte a câmera para o código que já vem impresso na caixa e receba uma resposta clara em menos de um segundo. Sem carteira, sem app, sem cadastro.",
    scan: "Escanear uma caixa de teste",
    code: "Ver o código aberto",
    stats: [
      ["718 ms", "p95 para verificar uma caixa,\nmedido na demo no ar"],
      ["~US$ 0,0001", "por selo de caixa com\nNFTs comprimidos"],
      ["0", "carteiras ou apps que\no paciente precisa"],
    ],
    alt: "Tela de veredito do Certapharm mostrando Autêntico para Demo Amoxicilina 500 mg, com a trilha de custódia",
  },
  quote: [
    "“Meu pai comprou vitaminas que eram falsificadas. Ele não tinha como conferir. Foi por isso que eu criei o Certapharm.”",
    "Ysrael de Jesus Sacramento, fundador · Universidade Federal de Sergipe",
  ],
  problem: {
    eb: "O problema",
    h: "Falsificadores copiam os remédios mais caros. E o paciente não tem como saber.",
    items: [
      ["1 em 10", "medicamentos em países de baixa e média renda é falsificado ou fora do padrão."],
      ["US$ 30,5 bi", "gastos por ano com esses produtos."],
      ["2025–26", "A Anvisa apreendeu lotes falsos de Keytruda, Mounjaro e Enhertu, com rótulo e código copiados."],
    ],
    src: "Fontes: Organização Mundial da Saúde; determinações de apreensão da Anvisa.",
  },
  answer: {
    eb: "A resposta",
    h: "Escaneie a caixa. Receba uma de três respostas.",
    items: [
      { tag: "Procedente", cls: "ok", text: "Um fabricante credenciado certificou o lote, e cada passagem está assinada.", alt: "Tela de veredito Autêntico", img: "d107fad4189a8432d61a11baed31729c" },
      { tag: "Procedente, com alerta", cls: "warn", text: "O lote é verdadeiro, mas está em recall ou tem aviso do regulador. Fale com o farmacêutico.", alt: "Tela de veredito com alerta de recall", img: "4ad30cb7807aecdac97b4c08de51b603" },
      { tag: "Não reconhecido", cls: "bad", text: "Não há registro deste lote, ou esta caixa não tem selo. Não compre nem use. Denuncie.", alt: "Tela de veredito Não reconhecido", img: "409cce308fcb66e81f788aed090dc572" },
    ],
    note: "As telas acima estão em inglês. O app também funciona em português.",
  },
  how: {
    eb: "Como funciona",
    h: "Uma trilha assinada, da fábrica à farmácia.",
    steps: [
      ["Credenciar", "O Certapharm credencia cada empresa da cadeia. Na blockchain fica só o hash do CNPJ, nunca o número."],
      ["Certificar", "O fabricante certifica o lote com a própria credencial no Solana Attestation Service. Ninguém mais consegue retirá-lo."],
      ["Assinar a custódia", "Transportadora, distribuidora e farmácia assinam cada passagem na Solana, com temperatura."],
      ["Selar e verificar", "Cada caixa recebe um selo em NFT comprimido. Qualquer pessoa verifica pelo celular ou audita no explorer da Solana."],
    ],
    alt: "Painel do gestor do Certapharm mostrando a trilha de custódia do lote L2026E com sete eventos assinados",
    cap: "O painel do gestor, no ar na devnet: cada evento da trilha leva à sua transação na Solana.",
  },
  video: { h: "Veja em 30 segundos.", label: "Teaser do Certapharm: o laboratório certifica, cada passagem é assinada, cada caixa é selada, o paciente escaneia" },
  demo: {
    eb: "Demo ao vivo",
    h: "Escaneie uma caixa de teste agora.",
    p: "Aponte a câmera do celular para qualquer código. Cada resposta vem direto da Solana devnet. Os produtos são fictícios.",
    qrs: [
      { img: "8eb1907741d8fa55ce9604d14644842c", alt: "QR code do lote de teste L2026D", tag: "Procedente", cls: "ok", cap: "Lote L2026D, trilha de custódia completa" },
      { img: "6fc7e1e1ef521828d8455bd52e222458", alt: "QR code do lote de teste L2026E", tag: "Procedente, com alerta", cls: "warn", cap: "Lote L2026E, em recall" },
      { img: "d09b5611b603de5bcdfd620f5d4480dc", alt: "QR code do lote de teste L2026X", tag: "Não reconhecido", cls: "bad", cap: "Lote L2026X, nunca certificado" },
    ],
    noPhone: "Sem celular por perto? ",
    link: "Digite um código no navegador",
    tail: ".",
  },
  solana: {
    eb: "Por que Solana",
    h: "Certificar uma caixa precisa custar uma fração de centavo.",
    items: [
      ["~US$ 110", "para 1 milhão de certificados de unidade, com state compression"],
      ["US$ 0,00075", "por evento de custódia assinado (5.000 lamports a US$ 150/SOL)"],
      ["718 ms", "p95 para verificar uma caixa na demo no ar"],
    ],
    p: "Feito só com recursos nativos da Solana: Attestation Service, NFTs comprimidos (Bubblegum) e memos assinados. Nenhum contrato próprio para auditar, e cada afirmação é pública no explorer.",
  },
  biz: {
    eb: "Para empresas",
    h: "A cadeia de suprimentos paga. O paciente confere de graça.",
    cards: [
      ["Fabricantes e importadores", "SaaS de conformidade", "Certifique lotes, acompanhe a custódia e responda a recalls com prova que qualquer pessoa confere."],
      ["Fabricantes de alto volume", "Selo por caixa", "Um selo por número de série, então uma caixa copiada é rejeitada mesmo quando o lote é real."],
      ["Redes de farmácias", "Verificação com sua marca", "Dê ao cliente uma resposta confiável no balcão, com a identidade da sua rede."],
    ],
    pilotH: "Faça um piloto com a gente.",
    pilotP: "Procuramos um importador e uma farmácia regional para testar o Certapharm.",
    subject: "Piloto%20Certapharm",
  },
  foot: { tag: "Prova de origem para cada caixa de remédio.", demo: "Demo ao vivo", other: "English", small: "Demo na devnet com produtos fictícios · Código aberto · Feito para o Colosseum 2026 · © 2026 Certapharm" },
};

export const copy = (lang: Lang): Copy => (lang === "pt" ? PT : EN);
