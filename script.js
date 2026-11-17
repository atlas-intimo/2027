"use strict";

/* ==========================================
   ATLAS ÍNTIMO — 2027
   Formulário e integração comercial
   ========================================== */

const CONFIG = Object.freeze({
    API_URL: "https://atlas-intimo-api.onrender.com",
    GEOCODIFICACAO_URL: "/cidades/",
    COMPRAS_ATIVAS: true,
    PRECO: 14.90,
    MOEDA: "BRL",
    TEMPO_BUSCA: 400,
    MAX_RESULTADOS: 10
});

const formulario = document.getElementById("pedido-form");
const campoNome = document.getElementById("nome");
const campoEmail = document.getElementById("email");
const campoData = document.getElementById("data_nascimento");
const campoHora = document.getElementById("hora_nascimento");
const campoCidade = document.getElementById("cidade_nascimento");
const campoEstado = document.getElementById("estado_nascimento");
const campoPais = document.getElementById("pais_nascimento");
const campoLatitude = document.getElementById("latitude");
const campoLongitude = document.getElementById("longitude");
const campoConsentimento = document.getElementById("consentimento");

const sugestoes = document.getElementById("sugestoes-cidades");
const cidadeStatus = document.getElementById("cidade-status");
const botaoPagamento = document.getElementById("botao-pagamento");
const mensagem = document.getElementById("form-mensagem");

let cidadeSelecionada = null;
let temporizadorBusca = null;
let controladorBusca = null;
let enviandoPedido = false;
let versaoBusca = 0;

const cacheCidades = new Map();
const LIMITE_CACHE = 5;

/* ==========================================
   CONFIGURAÇÃO INICIAL
   ========================================== */

function configurarFormulario() {
    const hoje = new Date();

    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");

    campoData.max = `${ano}-${mes}-${dia}`;

    campoCidade.placeholder =
        "Digite sua cidade de nascimento no Brasil";

    botaoPagamento.disabled = !CONFIG.COMPRAS_ATIVAS;

    if (!CONFIG.COMPRAS_ATIVAS) {
        mostrarMensagem(
            "Compras em breve. Estamos preparando seu Atlas Íntimo."
        );
    } else {
        mostrarMensagem("");
    }

    inserirCreditoGeografico();
}

/* ==========================================
   CRÉDITOS DA BASE GEOGRÁFICA
   ========================================== */

function inserirCreditoGeografico() {
    if (document.getElementById("credito-geografico")) {
        return;
    }

    const credito = document.createElement("small");

    credito.id = "credito-geografico";
    credito.style.display = "block";
    credito.style.fontSize = "0.75rem";
    credito.style.opacity = "0.75";
    credito.style.marginTop = "6px";

    const fonte = document.createElement("a");

    fonte.href = "https://www.geonames.org/";
    fonte.textContent = "GeoNames";
    fonte.target = "_blank";
    fonte.rel = "noopener noreferrer";

    const licenca = document.createElement("a");

    licenca.href =
        "https://creativecommons.org/licenses/by/4.0/";

    licenca.textContent = "CC BY 4.0";
    licenca.target = "_blank";
    licenca.rel = "noopener noreferrer";

    credito.append(
        "Base geográfica brasileira: ",
        fonte,
        " — ",
        licenca,
        ". Dados filtrados e reorganizados pelo Atlas Íntimo."
    );

    cidadeStatus.insertAdjacentElement("afterend", credito);
}

/* ==========================================
   MENSAGENS DO FORMULÁRIO
   ========================================== */

function mostrarMensagem(texto, tipo = "") {
    mensagem.textContent = texto;
    mensagem.className = tipo;
}

function fecharSugestoes() {
    sugestoes.replaceChildren();
    sugestoes.hidden = true;
}

function cancelarBusca() {
    clearTimeout(temporizadorBusca);
    versaoBusca++;

    if (controladorBusca) {
        controladorBusca.abort();
        controladorBusca = null;
    }
}

/* ==========================================
   NORMALIZAÇÃO DOS NOMES
   ========================================== */

function normalizarTexto(texto) {
    return String(texto ?? "")
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

/* ==========================================
   BASE GEOGRÁFICA LOCAL
   ========================================== */

function guardarCache(prefixo, cidades) {
    if (cacheCidades.has(prefixo)) {
        cacheCidades.delete(prefixo);
    }

    cacheCidades.set(prefixo, cidades);

    while (cacheCidades.size > LIMITE_CACHE) {
        const primeiro = cacheCidades.keys().next().value;
        cacheCidades.delete(primeiro);
    }
}

async function carregarBaseGeografica(prefixo, sinal) {
    if (cacheCidades.has(prefixo)) {
        const cidades = cacheCidades.get(prefixo);

        guardarCache(prefixo, cidades);

        return cidades;
    }

    const resposta = await fetch(
        `${CONFIG.GEOCODIFICACAO_URL}${prefixo}.json`,
        {
            signal: sinal,
            credentials: "omit",
            cache: "default"
        }
    );

    if (resposta.status === 404) {
        guardarCache(prefixo, []);
        return [];
    }

    if (!resposta.ok) {
        throw new Error(
            "Falha ao carregar a base geográfica."
        );
    }

    const tipoConteudo =
        resposta.headers.get("content-type") || "";

    /*
       Algumas configurações do Cloudflare Pages
       devolvem uma página HTML quando um arquivo
       está ausente.
    */

    if (tipoConteudo.includes("text/html")) {
        return [];
    }

    const dados = await resposta.json();

    if (!Array.isArray(dados)) {
        throw new Error(
            "Formato inválido da base geográfica."
        );
    }

    const cidades = dados.filter(cidade =>
        cidade &&
        typeof cidade.nome === "string" &&
        cidade.nome.trim().length > 0 &&
        cidade.pais === "Brasil" &&
        Number.isFinite(cidade.latitude) &&
        Number.isFinite(cidade.longitude) &&
        cidade.latitude >= -90 &&
        cidade.latitude <= 90 &&
        cidade.longitude >= -180 &&
        cidade.longitude <= 180
    );

    guardarCache(prefixo, cidades);

    return cidades;
}

/* ==========================================
   CLASSIFICAÇÃO DOS RESULTADOS
   ========================================== */

function pontuarCidade(cidade, consulta) {
    const nome = normalizarTexto(
        cidade.busca || cidade.nome
    );

    const alternativos = Array.isArray(cidade.alternativos)
        ? cidade.alternativos.map(normalizarTexto)
        : [];

    if (nome === consulta) {
        return 400;
    }

    if (alternativos.includes(consulta)) {
        return 350;
    }

    if (nome.startsWith(consulta)) {
        return 300;
    }

    if (
        alternativos.some(
            alternativo => alternativo.startsWith(consulta)
        )
    ) {
        return 250;
    }

    return 0;
}

function classificarCidades(cidades, consulta) {
    return cidades
        .map(cidade => ({
            cidade,
            pontuacao: pontuarCidade(cidade, consulta)
        }))
        .filter(resultado => resultado.pontuacao > 0)
        .sort((a, b) => {
            const diferencaPontuacao =
                b.pontuacao - a.pontuacao;

            if (diferencaPontuacao !== 0) {
                return diferencaPontuacao;
            }

            const diferencaPopulacao =
                (Number(b.cidade.populacao) || 0) -
                (Number(a.cidade.populacao) || 0);

            if (diferencaPopulacao !== 0) {
                return diferencaPopulacao;
            }

            return a.cidade.nome.localeCompare(
                b.cidade.nome,
                "pt-BR"
            );
        })
        .slice(0, CONFIG.MAX_RESULTADOS)
        .map(resultado => resultado.cidade);
}

/* ==========================================
   BUSCA DE CIDADES
   ========================================== */

function limparCidadeSelecionada() {
    cidadeSelecionada = null;

    campoLatitude.value = "";
    campoLongitude.value = "";
    campoEstado.value = "";
    campoPais.value = "";

    campoCidade.setCustomValidity(
        "Selecione sua cidade entre os resultados da busca."
    );

    cidadeStatus.textContent =
        "Selecione sua cidade entre os resultados da busca.";
}

function formatarCidade(cidade) {
    return [
        cidade.nome,
        cidade.estado,
        cidade.pais
    ].filter(Boolean).join(", ");
}

async function buscarCidades(consulta, versao) {
    if (versao !== versaoBusca) {
        return;
    }

    const consultaNormalizada =
        normalizarTexto(consulta);

    const prefixo = consultaNormalizada.slice(0, 2);

    if (!/^[a-z]{2}$/.test(prefixo)) {
        fecharSugestoes();

        cidadeStatus.textContent =
            "Digite o nome de uma localidade brasileira.";

        return;
    }

    const controlador = new AbortController();
    controladorBusca = controlador;

    cidadeStatus.textContent = "Buscando cidades...";

    try {
        const base = await carregarBaseGeografica(
            prefixo,
            controlador.signal
        );

        if (
            versao !== versaoBusca ||
            controlador.signal.aborted
        ) {
            return;
        }

        const cidades = classificarCidades(
            base,
            consultaNormalizada
        );

        apresentarCidades(cidades);

    } catch (erro) {
        if (
            erro.name === "AbortError" ||
            versao !== versaoBusca
        ) {
            return;
        }

        fecharSugestoes();

        cidadeStatus.textContent =
            "Não foi possível buscar cidades. Tente novamente.";

    } finally {
        if (controladorBusca === controlador) {
            controladorBusca = null;
        }
    }
}

function apresentarCidades(cidades) {
    fecharSugestoes();

    if (!cidades.length) {
        cidadeStatus.textContent =
            "Nenhuma localidade encontrada. Confira a grafia.";

        return;
    }

    const contagemNomes = new Map();

    cidades.forEach(cidade => {
        const nome = formatarCidade(cidade);

        contagemNomes.set(
            nome,
            (contagemNomes.get(nome) || 0) + 1
        );
    });

    cidades.forEach(cidade => {
        const botao = document.createElement("button");

        botao.type = "button";

        const nome = formatarCidade(cidade);

        if (contagemNomes.get(nome) > 1) {
            botao.textContent =
                `${nome} (${cidade.latitude.toFixed(3)}, ` +
                `${cidade.longitude.toFixed(3)})`;
        } else {
            botao.textContent = nome;
        }

        botao.addEventListener("click", () => {
            selecionarCidade(cidade);
        });

        sugestoes.appendChild(botao);
    });

    sugestoes.hidden = false;

    cidadeStatus.textContent =
        "Selecione a cidade correta na lista.";
}

function selecionarCidade(cidade) {
    cancelarBusca();

    cidadeSelecionada = {
        nome: cidade.nome,
        estado: cidade.estado || "",
        pais: cidade.pais,
        latitude: cidade.latitude,
        longitude: cidade.longitude
    };

    campoCidade.value = formatarCidade(cidade);

    campoLatitude.value = cidade.latitude;
    campoLongitude.value = cidade.longitude;
    campoEstado.value = cidade.estado || "";
    campoPais.value = cidade.pais;

    campoCidade.setCustomValidity("");

    fecharSugestoes();

    cidadeStatus.textContent =
        `✓ Local confirmado: ${formatarCidade(cidade)}`;
}

campoCidade.addEventListener("input", () => {
    cancelarBusca();
    limparCidadeSelecionada();
    fecharSugestoes();

    const consulta = campoCidade.value.trim();

    if (normalizarTexto(consulta).length < 2) {
        cidadeStatus.textContent =
            "Digite pelo menos duas letras.";

        return;
    }

    const versao = versaoBusca;

    temporizadorBusca = setTimeout(() => {
        buscarCidades(consulta, versao);
    }, CONFIG.TEMPO_BUSCA);
});

document.addEventListener("click", evento => {
    if (!evento.target.closest(".city-group")) {
        cancelarBusca();
        fecharSugestoes();
    }
});

campoCidade.addEventListener("keydown", evento => {
    if (evento.key === "Escape") {
        cancelarBusca();
        fecharSugestoes();
    }
});

/* ==========================================
   VALIDAÇÃO DOS DADOS
   ========================================== */

function validarFormulario() {
    if (!formulario.reportValidity()) {
        return false;
    }

    if (campoNome.value.trim().length < 2) {
        mostrarMensagem(
            "Informe um nome válido.",
            "erro"
        );

        campoNome.focus();

        return false;
    }

    if (!cidadeSelecionada) {
        mostrarMensagem(
            "Selecione sua cidade de nascimento na lista.",
            "erro"
        );

        campoCidade.focus();

        return false;
    }

    if (!campoHora.value) {
        mostrarMensagem(
            "Informe seu horário de nascimento.",
            "erro"
        );

        return false;
    }

    if (!campoConsentimento.checked) {
        mostrarMensagem(
            "Leia e aceite os documentos antes de continuar.",
            "erro"
        );

        return false;
    }

    return true;
}

function montarPedido() {
    return {
        nome: campoNome.value.trim(),

        email: campoEmail.value.trim().toLowerCase(),

        data_nascimento: campoData.value,

        hora_nascimento: campoHora.value.length === 5
            ? `${campoHora.value}:00`
            : campoHora.value,

        cidade_nascimento: cidadeSelecionada.nome,

        estado_nascimento: cidadeSelecionada.estado || null,

        pais_nascimento: cidadeSelecionada.pais,

        latitude: cidadeSelecionada.latitude,

        longitude: cidadeSelecionada.longitude
    };
}

/* ==========================================
   MERCADO PAGO
   ========================================== */

function validarLinkPagamento(link) {
    try {
        const url = new URL(link);

        const dominiosPermitidos = [
            "mercadopago.com.br",
            "www.mercadopago.com.br",
            "mercadopago.com",
            "www.mercadopago.com",
            "sandbox.mercadopago.com.br",
            "sandbox.mercadopago.com"
        ];

        return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            dominiosPermitidos.includes(url.hostname)
        );

    } catch {
        return false;
    }
}

/* ==========================================
   ENVIO DO PEDIDO
   ========================================== */

formulario.addEventListener("submit", async evento => {
    evento.preventDefault();

    if (!CONFIG.COMPRAS_ATIVAS) {
        mostrarMensagem(
            "As compras ainda não estão disponíveis."
        );

        return;
    }

    if (enviandoPedido) {
        return;
    }

    if (!validarFormulario()) {
        return;
    }

    enviandoPedido = true;
    botaoPagamento.disabled = true;

    botaoPagamento.textContent =
        "Preparando seu pedido...";

    mostrarMensagem(
        "Estamos preparando seu checkout seguro."
    );

    let redirecionando = false;

    try {
        const pedido = montarPedido();

        const resposta = await fetch(
            `${CONFIG.API_URL}/pedidos`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "omit",
                body: JSON.stringify(pedido)
            }
        );

        if (!resposta.ok) {
            if (
                resposta.status === 400 ||
                resposta.status === 422
            ) {
                throw new Error(
                    "Confira seus dados de nascimento. " +
                    "O horário informado pode não ser válido."
                );
            }

            throw new Error(
                "Não foi possível preparar seu pagamento. " +
                "O pedido pode ter sido registrado. " +
                "Evite repetir a solicitação imediatamente."
            );
        }

        const resultado = await resposta.json();

        if (
            !resultado.pedido_id ||
            !resultado.checkout_url ||
            Number(resultado.valor) !== CONFIG.PRECO ||
            resultado.moeda !== CONFIG.MOEDA
        ) {
            throw new Error(
                "Não foi possível validar as informações do pedido."
            );
        }

        if (!validarLinkPagamento(resultado.checkout_url)) {
            throw new Error(
                "O endereço do pagamento não pôde ser validado."
            );
        }

        mostrarMensagem(
            "Redirecionando para o Mercado Pago...",
            "sucesso"
        );

        window.location.assign(resultado.checkout_url);

        redirecionando = true;

    } catch (erro) {
        mostrarMensagem(
            erro instanceof TypeError
                ? "Não foi possível confirmar a comunicação com o servidor. Evite repetir o pedido imediatamente."
                : erro.message,
            "erro"
        );

    } finally {
        if (!redirecionando) {
            enviandoPedido = false;

            botaoPagamento.disabled =
                !CONFIG.COMPRAS_ATIVAS;

            botaoPagamento.textContent =
                "Continuar para o pagamento";
        }
    }
});

window.addEventListener("pageshow", evento => {
    if (evento.persisted) {
        enviandoPedido = false;

        botaoPagamento.disabled =
            !CONFIG.COMPRAS_ATIVAS;

        botaoPagamento.textContent =
            "Continuar para o pagamento";
    }
});

/* ==========================================
   INICIALIZAÇÃO
   ========================================== */

configurarFormulario();
