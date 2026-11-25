# Email di accesso con Gmail (SMTP) · guida per Francesco (24 nov 2026)

Oggi il link magico parte dal servizio di prova di Supabase, che manda **poche email all'ora**: oltre 3–4 amici le email
smettono di arrivare. Con l'SMTP di Gmail le email partono dal tuo indirizzo, con il nome "Deep Studio", fino a circa
**500 al giorno**, gratis. Quando ci sarà un dominio nostro (es. deepstudio.it) si passa a un servizio come Resend.

> La password per le app si scrive **solo** nel pannello di Supabase. Mai in chat, mai su git.

## 1. Gmail: verifica in due passaggi e password per le app (5 minuti)

1. Apri **myaccount.google.com → Sicurezza**.
2. Accendi la **Verifica in due passaggi** (se non c'è già).
3. Cerca **"Password per le app"** (o apri myaccount.google.com/apppasswords).
4. Nome dell'app: `Deep Studio Supabase` → **Crea**.
5. Google mostra una password di 16 lettere (tipo `abcd efgh ijkl mnop`). Copiala: serve al passo 2.
   Si può revocare quando vuoi dalla stessa pagina.

## 2. Supabase: SMTP (3 minuti)

1. Apri il progetto su **supabase.com → Authentication → Emails → SMTP Settings** e accendi **Enable Custom SMTP**.
2. Compila:

   | Campo | Valore |
   | :--- | :--- |
   | Sender email | il tuo indirizzo Gmail |
   | Sender name | `Deep Studio` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | il tuo indirizzo Gmail |
   | Password | la password per le app del passo 1 (senza spazi) |
   | Minimum interval | `30` secondi (va bene così) |

3. **Save**.
4. **Authentication → Rate Limits**: "Rate limit for sending emails" a **60** all'ora (con l'SMTP proprio si può alzare).

## 3. Supabase: l'email in italiano (2 minuti)

**Authentication → Emails → Templates → Magic Link** (e, se vuoi, anche **Confirm signup** con lo stesso testo):

- **Subject**: `Il tuo link per entrare in Deep Studio`
- **Body**: incolla questo

```html
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #15131c; color: #ece8f6; border-radius: 14px;">
  <p style="font-size: 13px; letter-spacing: 2px; color: #9a74e0; margin: 0 0 16px;">DEEP STUDIO</p>
  <h1 style="font-size: 22px; margin: 0 0 12px;">Il tuo studio ti aspetta</h1>
  <p style="font-size: 15px; line-height: 1.5; margin: 0 0 20px;">
    Premi il pulsante per entrare: niente password, il link vale solo per te e scade tra poco.
  </p>
  <p style="margin: 0 0 24px;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; background: #9a74e0; color: #15131c; text-decoration: none; font-weight: bold; border-radius: 10px;">Entra in Deep Studio</a>
  </p>
  <p style="font-size: 12px; line-height: 1.5; color: #a59fb8; margin: 0;">
    Non hai chiesto tu di entrare? Ignora questa email: senza il link nessuno può accedere.
  </p>
</div>
```

`{{ .ConfirmationURL }}` va lasciato così: Supabase ci mette il link vero.

## 4. Prova (2 minuti)

1. Da una finestra in incognito apri https://deep-studio-azure.vercel.app → Accedi, con un'email tua diversa
   (o quella di un amico).
2. L'email deve arrivare dal tuo nome "Deep Studio", in italiano, in pochi secondi. Se finisce nello spam, segnala
   "Non è spam": dopo le prime volte Gmail impara.
3. Se non arriva: Supabase → **Logs → Auth** dice l'errore (di solito una password per le app copiata male).

**Com'è andata (25 nov):** funziona con il Gmail dedicato `deepstudio.app`. L'errore `535 BadCredentials` nei log
voleva dire password per le app copiata male: rifatta da capo, svuotando il campo e senza spazi, è passata. Le prime
email arrivano nello **spam** (account nuovo, niente dominio nostro): chi le riceve preme "Non è spam" e aggiunge
l'indirizzo ai contatti. La soluzione vera arriva con un dominio nostro e un servizio come Resend (SPF e DKIM).

Fatto questo, nel CLAUDE.md la voce "email di accesso con SMTP" si può segnare come fatta.
