module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { subject = "", bodyHtml = "", bodyText = "", to = "", cc = "", attachments = [], fileName = "email.msg" } = body;

    if (!subject || !bodyHtml) {
      return res.status(400).json({ error: "subject e bodyHtml são obrigatórios" });
    }

    const { Email, Attachment, MessageEditorFormat } = await import("@tutao/oxmsg");

    try {
      Object.defineProperty(globalThis, "navigator", {
        value: { language: "en_US", languages: ["en_US"] },
        configurable: true,
      });
    } catch {
      // Se o runtime não permitir redefinir o navigator, seguimos com o padrão.
    }

    const email = new Email(true, false);

    email
      .subject(String(subject))
      .bodyHtml(String(bodyHtml))
      .bodyText(String(bodyText || ""))
      .bodyFormat(MessageEditorFormat.EDITOR_FORMAT_HTML);

    const addRecipients = (raw, method) => {
      String(raw || "")
        .split(/[;,]/)
        .map(value => value.trim())
        .filter(Boolean)
        .forEach(address => email[method](address));
    };

    addRecipients(to, "to");
    addRecipients(cc, "cc");

    attachments.forEach(att => {
      if (!att || !att.name || !att.base64) return;
      const bytes = new Uint8Array(Buffer.from(att.base64, "base64"));
      email.attach(new Attachment(bytes, String(att.name)));
    });

    const msgBytes = email.msg();
    const safeName = String(fileName || "email.msg").replace(/[^\w.\-]+/g, "_");

    res.setHeader("Content-Type", "application/vnd.ms-outlook");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName.endsWith(".msg") ? safeName : `${safeName}.msg`}"`);
    return res.status(200).send(Buffer.from(msgBytes));
  } catch (error) {
    console.error("Erro ao gerar .msg:", error);
    return res.status(500).json({ error: "Falha ao gerar arquivo .msg" });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};
