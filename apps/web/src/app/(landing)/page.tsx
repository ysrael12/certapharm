import { resolveLang } from "@/lib/i18n";
import { copy } from "./copy";

const A = (id: string, ext = "png") => `/landing/${id}.${ext}`;
const VIDEO = "bc9763c7a028fd5d1958b72fdefeb93a";
const CUSTODY = "edcd342197bc34ef166bc9e4e2ecd85d";
const GITHUB = "https://github.com/ysrael12/certapharm";

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M93.7 31.7 A44 44 0 1 0 93.7 88.3" fill="none" stroke="#fdf0d5" strokeWidth="13" strokeLinecap="round" />
      <path d="M40 62 L55 77 L106 28" fill="none" stroke="#669bbc" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Br({ text }: { text: string }) {
  const parts = text.split("\n");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {p}
        </span>
      ))}
    </>
  );
}

export default async function Landing({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = resolveLang((await searchParams).lang);
  const c = copy(lang);
  const check = lang === "pt" ? "/check?lang=pt" : "/check";
  const other = lang === "pt" ? "/" : "/?lang=pt";

  return (
    <div className="lp">
      <header className="dark">
        <nav className="w nav" aria-label={c.nav.label}>
          <a href="#top" className="brand"><Logo size={34} /><span>Certapharm</span></a>
          <div className="row">
            <a href="#how">{c.nav.how}</a>
            <a href="#demo">{c.nav.demo}</a>
            <a href="#business">{c.nav.biz}</a>
            <div className="lang">
              {lang === "en" ? <span className="on">EN</span> : <a href="/">EN</a>}
              {lang === "pt" ? <span className="on">PT</span> : <a href="/?lang=pt">PT</a>}
            </div>
            <a className="cta" href={check}>{c.nav.open}</a>
          </div>
        </nav>
        <section id="top" className="w hero">
          <div className="txt">
            <p className="pill">{c.hero.pill}</p>
            <h1>{c.hero.h1a}<span>{c.hero.h1b}</span></h1>
            <p className="lead">{c.hero.lead}</p>
            <div className="row" style={{ gap: 14 }}>
              <a className="btn1" href="#demo">{c.hero.scan}</a>
              <a className="btn2" href={GITHUB}>{c.hero.code}</a>
            </div>
            <div className="stats">
              {c.hero.stats.map(([n, d]) => (
                <div key={n}><span className="num">{n}</span><span><Br text={d} /></span></div>
              ))}
            </div>
          </div>
          <div className="phone"><div><img src={A("d107fad4189a8432d61a11baed31729c")} alt={c.hero.alt} fetchPriority="high" /></div></div>
        </section>
      </header>

      <main>
        <section className="quote">
          <p>{c.quote[0]}</p>
          <p className="muted">{c.quote[1]}</p>
        </section>

        <section className="w sec tight" aria-labelledby="problem-h">
          <div className="hgroup"><p className="eb">{c.problem.eb}</p><h2 id="problem-h" style={{ maxWidth: 820 }}>{c.problem.h}</h2></div>
          <div className="grid">
            {c.problem.items.map(([n, d]) => (
              <div className="big" key={n}><span className="num">{n}</span><span className="muted">{d}</span></div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 15 }}>{c.problem.src}</p>
        </section>

        <section className="band" aria-labelledby="answers-h">
          <div className="w">
            <div className="hgroup"><p className="eb" style={{ color: "#3f7aa0" }}>{c.answer.eb}</p><h2 id="answers-h">{c.answer.h}</h2></div>
            <div className="three">
              {c.answer.items.map((i) => (
                <figure key={i.img}>
                  <img src={A(i.img)} alt={i.alt} loading="lazy" />
                  <figcaption><span className={`tag ${i.cls}`}>{i.tag}</span><span className="muted">{i.text}</span></figcaption>
                </figure>
              ))}
            </div>
            {c.answer.note && <p className="muted" style={{ fontSize: 15 }}>{c.answer.note}</p>}
          </div>
        </section>

        <section id="how" className="w sec" aria-labelledby="how-h">
          <div className="hgroup"><p className="eb">{c.how.eb}</p><h2 id="how-h">{c.how.h}</h2></div>
          <ol className="steps">
            {c.how.steps.map(([t, d], i) => (
              <li key={t} className={i === 3 ? "last" : ""}><span className="num">0{i + 1}</span><strong>{t}</strong><span>{d}</span></li>
            ))}
          </ol>
          <figure className="shot">
            <div className="frame">
              <div className="bar"><span className="dot" /><span className="dot" /><span className="dot" /><span className="url">certapharm.vercel.app/manager/custody</span></div>
              <img src={A(CUSTODY)} alt={c.how.alt} loading="lazy" />
            </div>
            <figcaption className="muted" style={{ fontSize: 16 }}>{c.how.cap}</figcaption>
          </figure>
        </section>

        <section className="dark" aria-labelledby="video-h">
          <div className="w vid">
            <h2 id="video-h">{c.video.h}</h2>
            <video src={A(VIDEO, "mp4")} controls muted playsInline preload="metadata" aria-label={c.video.label} />
          </div>
        </section>

        <section id="demo" className="w sec" aria-labelledby="demo-h">
          <div className="hgroup">
            <p className="eb">{c.demo.eb}</p><h2 id="demo-h">{c.demo.h}</h2>
            <p className="muted" style={{ maxWidth: 640 }}>{c.demo.p}</p>
          </div>
          <div className="qrs">
            {c.demo.qrs.map((x) => (
              <div className="qr" key={x.img}>
                <img src={A(x.img)} alt={x.alt} width={200} height={200} loading="lazy" />
                <span className={`tag ${x.cls}`}>{x.tag}</span><span className="muted">{x.cap}</span>
              </div>
            ))}
          </div>
          <p>{c.demo.noPhone}<a href={check} style={{ fontWeight: 600 }}>{c.demo.link}</a>{c.demo.tail}</p>
        </section>

        <section className="red" aria-labelledby="solana-h">
          <div className="w">
            <div className="hgroup"><p className="eb">{c.solana.eb}</p><h2 id="solana-h" style={{ maxWidth: 860 }}>{c.solana.h}</h2></div>
            <div className="grid">
              {c.solana.items.map(([n, d]) => (
                <div className="big" key={n}><span className="num">{n}</span><span>{d}</span></div>
              ))}
            </div>
            <p style={{ maxWidth: 760 }}>{c.solana.p}</p>
          </div>
        </section>

        <section id="business" className="w sec" aria-labelledby="business-h">
          <div className="hgroup"><p className="eb">{c.biz.eb}</p><h2 id="business-h">{c.biz.h}</h2></div>
          <div className="cards">
            {c.biz.cards.map(([k, t, d]) => (
              <div className="card" key={t}><small>{k}</small><strong>{t}</strong><span className="muted">{d}</span></div>
            ))}
          </div>
          <div className="pilot">
            <div><strong>{c.biz.pilotH}</strong><span>{c.biz.pilotP}</span></div>
            <a className="btn1" style={{ background: "#fdf0d5" }} href={`mailto:ysraelsacrati09@gmail.com?subject=${c.biz.subject}`}>ysraelsacrati09@gmail.com</a>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="w">
          <div className="row" style={{ gap: 12 }}><Logo size={30} /><b>Certapharm</b><span>{c.foot.tag}</span></div>
          <div className="row" style={{ gap: 20 }}>
            <a href={check}>{c.foot.demo}</a>
            <a href={GITHUB}>GitHub</a>
            <a href={other}>{c.foot.other}</a>
          </div>
          <small>{c.foot.small}</small>
        </div>
      </footer>
    </div>
  );
}
