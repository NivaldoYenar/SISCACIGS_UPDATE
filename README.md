# Sistema de Cautela e Descautela de Materiais – CIGS 🐆

Este repositório reúne o código-fonte de um sistema web desenvolvido para apoiar o controle de **cautela e descautela de materiais** no Centro de Instrução de Guerra na Selva (CIGS).

Historicamente, o processo era realizado de forma **inteiramente manual**: os militares preenchiam fichas em papel, que depois eram digitadas em uma planilha eletrônica e, por fim, impressas em formato PDF para arquivo e conferência. Esse fluxo consome tempo, é sujeito a erros de transcrição e dificulta a atualização e rastreabilidade das informações.

O sistema proposto automatiza esse processo, permitindo que:

- A cautela e a descautela sejam registradas diretamente em uma **aplicação web**;
- Os dados sejam armazenados em um **banco de dados relacional**;
- A ficha em **PDF**, com o mesmo layout utilizado atualmente nas planilhas do CIGS, seja gerada **automaticamente**, pronta para impressão e arquivamento.

Além disso, o sistema foi concebido para funcionar **integrado a um módulo de reconhecimento facial**: a identificação do militar é feita por uma aplicação externa, que envia ao backend a identificação do usuário responsável pela cautela/descautela. Com isso, reduz-se a necessidade de preenchimento manual de dados pessoais e aumenta-se a confiabilidade dos registros.

## 🎯 Objetivos do Projeto

- **Digitalizar** o processo de controle de materiais, substituindo formulários em papel por telas amigáveis.
- **Padronizar** e centralizar as informações de cautela/descautela em um único sistema.
- **Reduzir erros** de preenchimento e de digitação ao transferir dados do papel para a planilha.
- **Manter o mesmo formato de ficha em PDF** já utilizado pelo CIGS, facilitando a adoção do sistema pelo usuário final.
- **Permitir rastreabilidade**: saber quem cautelou, o que foi cautelado, quando foi cautelado, quando foi devolvido e em qual condição.

## 🧩 Visão Geral da Solução

A solução é composta por dois principais módulos:

- **Backend** (API em Python/FastAPI + PostgreSQL): responsável por gerenciar o cadastro de materiais, registros de cautela/descautela, integração com reconhecimento facial e geração do PDF.
- **Frontend** (aplicação web em Next.js/React): interface utilizada pelos operadores e usuários para visualizar materiais, registrar operações e emitir relatórios em PDF.

O fluxo básico é o seguinte:

1. O militar é identificado (via reconhecimento facial ou seleção no sistema).
2. O operador seleciona os materiais que serão cautelados ou devolvidos.
3. O sistema registra a operação no banco de dados, atualizando o status dos itens.
4. A qualquer momento, o usuário pode gerar uma **ficha em PDF** com as cautelas/descautelas de um determinado dia ou período, já no padrão utilizado pelo CIGS.


