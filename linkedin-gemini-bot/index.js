require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const https = require("https");
const fs = require("fs");

// Inicializa o Gemini com a API Key carregada do .env
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const AUTHOR_URN = "urn:li:person:kAL7nDBU1h";
const LOCAL_IMAGE_PATH = "./imagem.png";

async function gerarEPublicarComIA() {
  try {
    console.log("1. A gerar conteúdo e link relacionado com o Gemini...");

    // Prompt inteligente que pede o post e um link de contexto relacionado com o tema
    const postPrompt =
      `Escreve um post profissional para o LinkedIn sobre as vantagens de automatizar tarefas repetitivas com Node.js e Inteligência Artificial. 
      Usa um tom corporativo mas acessível, estrutura o texto com tópicos organizados usando símbolos como ✅ ou 🚀, e adiciona hashtags relevantes no final.
      
      Além disso, identifica um URL/link da Web real e público altamente relacionado com o tema (por exemplo, a documentação oficial do Node.js, um artigo da OpenAI ou um recurso técnico relevante).
      
      Responde estritamente no seguinte formato exato, sem adicionar mais nada:
      [TEXTO_DO_POST]
      (escreve aqui todo o texto do post, sem incluir o link no meio)
      ---LINK:---
      (coloca aqui apenas o URL web relacionado)`.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: postPrompt,
    });
    const rawOutput = response.text.trim();

    // Separar dinamicamente o texto do post e o link gerado pela IA
    let postText = rawOutput;
    let relatedLink = "https://nodejs.org"; // Fallback caso a IA falhe o formato

    if (rawOutput.includes("---LINK:---")) {
      const parts = rawOutput.split("---LINK:---");
      postText = parts[0].trim();
      relatedLink = parts[1].trim();
    }

    // Juntar o link no final do post para o LinkedIn agarrar a pré-visualização
    const finalPostContent = `${postText}\n\nSabe mais sobre o assunto aqui: ${relatedLink}`;

    console.log(
      "\n--- CONTEÚDO GERADO E LINK RELACIONADO ---\n",
      finalPostContent,
      "\n------------------------------------------\n",
    );

    // Verificar se existe uma imagem localmente na pasta
    const hasImage = fs.existsSync(LOCAL_IMAGE_PATH);

    if (hasImage) {
      console.log(
        "📁 Imagem detetada na pasta! A tentar publicar com imagem...",
      );
      try {
        const uploadData = await registerImageUpload(ACCESS_TOKEN, AUTHOR_URN);
        console.log("4. A enviar o binário da imagem...");
        await uploadBinaryImage(uploadData.uploadUrl, LOCAL_IMAGE_PATH);

        console.log("5. A publicar o post com imagem no LinkedIn...");
        await sendPostToLinkedIn(
          ACCESS_TOKEN,
          AUTHOR_URN,
          finalPostContent,
          uploadData.imageAsset,
          "IMAGE",
        );
        console.log("🎉 Post com imagem publicado com sucesso!");
        return;
      } catch (imgError) {
        console.warn(
          "⚠️ Falha ao publicar com imagem (restrição da API do LinkedIn). A fazer fallback para texto puro...",
          imgError,
        );
      }
    } else {
      console.log(
        "ℹ️ Nenhuma imagem encontrada na pasta. A publicar apenas em texto...",
      );
    }

    // Publica em texto puro com o link dinâmico incluído (o LinkedIn gera o card de preview automaticamente)
    await sendPostToLinkedIn(
      ACCESS_TOKEN,
      AUTHOR_URN,
      finalPostContent,
      null,
      "NONE",
    );
    console.log("🎉 Post em texto publicado com sucesso com link dinâmico!");
  } catch (error) {
    console.error("Erro no processo de publicação:", error);
  }
}

function registerImageUpload(token, authorURN) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      initializeUploadRequest: {
        owner: authorURN,
      },
    });

    const options = {
      hostname: "api.linkedin.com",
      path: "/v2/images?action=initializeUpload",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const json = JSON.parse(body);
          resolve({
            uploadUrl: json.value.uploadUrl,
            imageAsset: json.value.image,
          });
        } else {
          reject(`Erro ao iniciar upload (${res.statusCode}): ${body}`);
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function uploadBinaryImage(uploadUrl, filePath) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    const urlObj = new URL(uploadUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": fileBuffer.length,
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve();
        else reject(`Erro no envio binário (${res.statusCode}): ${body}`);
      });
    });
    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
}

function sendPostToLinkedIn(token, authorURN, text, mediaAsset, mediaCategory) {
  return new Promise((resolve, reject) => {
    const shareContent = {
      shareCommentary: { text: text },
      shareMediaCategory: mediaCategory,
    };

    if (mediaCategory === "IMAGE" && mediaAsset) {
      shareContent.media = [
        {
          status: "READY",
          description: { text: "Automação Tech" },
          media: mediaAsset,
          title: { text: "Node.js & IA" },
        },
      ];
    }

    const postData = JSON.stringify({
      author: authorURN,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": shareContent,
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    });

    const options = {
      hostname: "api.linkedin.com",
      path: "/v2/ugcPosts",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          resolve();
        } else {
          reject(`Erro ao publicar (${res.statusCode}): ${body}`);
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

gerarEPublicarComIA();
