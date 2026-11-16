
"use strict";

/* ==========================================
   ATLAS ÍNTIMO — 2027
   Formulário e integração comercial
   ========================================== */

const CONFIG = Object.freeze({
    API_URL: "https://atlas-intimo-api.onrender.com",
    GEOCODIFICACAO_URL:
        "https://geocoding-api.open-meteo.com/v1/search",
    COMPRAS_ATIVAS: false,
    PRECO: 14.90,
    MOEDA: "BRL",
    TEMPO_BUSCA: 500
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

/* ==========================================
   CONFIGURAÇÃO INICIAL
   ========================================== */

function configurarFormulario() {
    const hoje = new Date();

    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");

    campoData.max = `${ano}-${mes}-${dia}`;

    botaoPagamento.disabled = !CONFIG.COMPRAS_ATIVAS;

    if (!CONFIG.COMPRAS_ATIVAS) {
        mostrarMensagem(
            "Compras em breve. Estamos preparando seu Atlas Íntimo."
        );
    } else {
        mostrarMensagem("");
    }
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
        cidade.name,
        cidade.admin1,
        cidade.country
    ].filter(Boolean).join(", ");
}

async function buscarCidades(consulta, versao) {

    if (versao !== versaoBusca) {
        return;
    }

    const controlador = new AbortController();
    controladorBusca = controlador;

    cidadeStatus.textContent = "Buscando cidades...";

    try {
        const parametros = new URLSearchParams({
            name: consulta,
            count: "10",
            language: "pt",
            format: "json"
        });

        const resposta = await fetch(
            `${CONFIG.GEOCODIFICACAO_URL}?${parametros}`,
            {
                signal: controlador.signal,
                credentials: "omit"
            }
        );

        if (!resposta.ok) {
            throw new Error("Falha na busca de cidades.");
        }

        const dados = await resposta.json();

        if (versao !== versaoBusca) {
            return;
        }

        const cidades = Array.isArray(dados.results)
            ? dados.results.filter(cidade =>
                cidade.name &&
                cidade.country &&
                Number.isFinite(cidade.latitude) &&
                Number.isFinite(cidade.longitude)
            )
            : [];

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
            "Nenhuma cidade encontrada. Confira a grafia.";
        return;
    }

    cidades.forEach(cidade => {

        const botao = document.createElement("button");

        botao.type = "button";
        botao.textContent = formatarCidade(cidade);

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
        nome: cidade.name,
        estado: cidade.admin1 || "",
        pais: cidade.country,
        latitude: cidade.latitude,
        longitude: cidade.longitude
    };

    campoCidade.value = formatarCidade(cidade);

    campoLatitude.value = cidade.latitude;
    campoLongitude.value = cidade.longitude;
    campoEstado.value = cidade.admin1 || "";
    campoPais.value = cidade.country;

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

    if (consulta.length < 3) {
        cidadeStatus.textContent =
            "Digite pelo menos três letras.";
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

            if (resposta.status === 400 ||
                resposta.status === 422) {

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
        botaoPagamento.disabled = !CONFIG.COMPRAS_ATIVAS;
        botaoPagamento.textContent =
            "Continuar para o pagamento";
    }
});

/* ==========================================
   INICIALIZAÇÃO
   ========================================== */

configurarFormulario();
