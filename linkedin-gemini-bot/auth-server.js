require("dotenv").config();
const http = require("http");
const https = require("https");
const url = require("url");

// Carregado de forma segura através do ficheiro .env
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000";

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // Se recebemos o parâmetro 'code', estamos a apanhar o callback do LinkedIn
  if (parsedUrl.query && parsedUrl.query.code) {
    const authCode = parsedUrl.query.code;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.write(
      "<h2>Autenticação bem-sucedida! A obter o Access Token... Podes fechar esta janela.</h2>",
    );
    res.end();

    // Trocar o código de autorização pelo Access Token via pedido POST
    const postData = new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }).toString();

    const options = {
      hostname: "www.linkedin.com",
      port: 443,
      path: "/oauth/v2/accessToken",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const tokenReq = https.request(options, (tokenRes) => {
      let data = "";
      tokenRes.on("data", (chunk) => {
        data += chunk;
      });
      tokenRes.on("end", () => {
        console.log("\n========================================");
        console.log(" ACCESS TOKEN OBTIDO COM SUCESSO! ");
        console.log("========================================");
        console.log(data);
        console.log("========================================\n");
        server.close(); // Fecha o servidor automaticamente
      });
    });

    tokenReq.write(postData);
    tokenReq.end();
  } else {
    // Caso contrário, redireciona o browser para a página de login do LinkedIn com os escopos completos
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=w_member_social%20openid%20profile`;
    res.writeHead(302, { Location: authUrl });
    res.end();
  }
});

server.listen(3000, () => {
  console.log("Servidor de autenticação a correr em http://localhost:3000");
  console.log(
    "Abre o link http://localhost:3000 no teu browser para iniciar a autenticação.",
  );
});