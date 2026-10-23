# Passagem de projeto — Hueco Sound

Estado em 23/10/2026. Este arquivo resume o trabalho e as decisões da conversa; não é uma transcrição. Leia a source atual antes de editar. Preserve a biblioteca do usuário e as configurações EAS existentes.

## Pedido e direção do usuário

Continuar um aplicativo Android de música, inicialmente chamado Liner Mobile e agora **Hueco Sound**. O usuário quer uma experiência fluida, com busca, playlists, fila e controles de mídia no Android, inspirada na usabilidade do Spotify e nas funções do Liner de PC. Créditos explícitos a **ZhyrSnow** e ao projeto de origem Liner. Visual escuro/turquesa inspirado em Hueco Mundo, usando as artes enviadas pelo usuário: logo Hueco Sound, rosto do personagem como ícone e folha com quatro sprites. Ele quer continuar fazendo edições pelo Antigravity. Prefere ações diretas e não quer aguardar builds longas que falhem por verificações básicas omitidas.

## Onde estão os arquivos

- **Projeto principal, atualizado:** `C:/Users/Administrator/Downloads/TRAAAP/liner-mobile`.
- Source de referência do PC: `C:/Users/Administrator/Downloads/TRAAAP/desktop-main/desktop-main`.
- Entrega portátil: `Hueco-Sound-1.2.0-codigo.zip`, nesta mesma pasta outputs. Extrair o projeto para trabalhar em outro computador. Não inclui node_modules, Android gerado ou credenciais.
- Guia de APK: `HUECO-SOUND-GERAR-APK.md`.
- Investigação de áudio: `ANALISE-FONTES-AUDIO.md`.
- Ícone separado: `Hueco-Sound-icone.png`.
- `Liner-1.1.0-codigo.zip`, `RETOMAR.md` e partes dos relatórios antigos são históricos. Não restaurar configurações antigas sobre a source atual.

## Stack e identidade

Expo SDK 58 (~58.0.17), React Native 0.88.0, React 19.3.0, TypeScript, Expo Router, Zustand, expo-audio AudioPlaylist, AsyncStorage, SecureStore. Leia `AGENTS.md` e a documentação da versão do SDK antes de alterar APIs Expo.

- Nome/slug: Hueco Sound / hueco-sound.
- Versão 1.2.0, Android versionCode 3.
- Pacote Android: `com.zhyrsnow.huecosound`.
- Links: `huecosound://`.
- EAS projectId: `36161a73-84df-478a-8299-e48cfd6c2839`.
- Conta/projeto que o usuário criou: `viniciuszzz/hueco-sound`.
- O usuário já fez login no EAS e criou uma keystore remota. **Reutilizar a assinatura e o projeto.** Não criar outra identidade para uma atualização.
- Como o pacote mudou de com.liner.music, exportar a biblioteca da versão antiga e importar no Hueco Sound. Backup contém metadados, não áudios.

## Funcionalidades implementadas

Início com descobertas/recentes; busca; biblioteca; curtidas com metadados; histórico; criar/renomear/excluir playlists; adicionar à playlist pelo menu das faixas; reordenar músicas e fila; próxima/anterior; seek; aleatório com histórico; repetir desligado/fila/faixa; sessão persistida restaurada pausada; letras do LRCLIB e ajuste de offset; temporizador e pausa ao final da música; velocidade/volume; importação de arquivos; downloads progressivos; backup JSON. Conta Liner opcional com armazenamento seguro nativo, importação online e envio explícito de curtidas.

AudioPlaylist mantém uma janela pequena de próximas faixas e os controles nativos no APK. Expo Go não tenta iniciar o serviço próprio de mídia. App config tem enableBackgroundPlayback e permissões de serviço de mídia; não solicita gravação de microfone.

## Fonte das músicas e falhas corrigidas

**Não usa API do Spotify para obter áudio.** Busca: YouTube Music/Innertube. Reprodução: cache autenticado Liner quando disponível, depois fontes YouTube/Googlevideo; SoundCloud como alternativa com correspondência de título/artista/duração.

O PC foi inspecionado: streamResolver.ts tenta Liner e depois innertubeAudio.ts. Perfis diretos VISIONOS e ANDROID_VR. Há também WEB_REMIX/youtubei.js com tokens gerados por janela Electron — **não foi portado**.

Erro reproduzido: URLs ANDROID_VR aceitavam range=0-0 ou o começo do arquivo, mas retornavam HTTP 403 no pedido aberto do player ou em trechos posteriores. Resolver uma URL não prova que a faixa toca. Correção atual prioriza VISIONOS e verifica o fim do arquivo quando o tamanho é conhecido.

No Android/iOS, `prepareSource.native.ts` prepara Googlevideo com tamanho conhecido num arquivo de cache, lendo trechos limitados; valida tamanho e tipo, cancela operações antigas, limpa partes incompletas e tenta outra fonte se necessário. Só arquivo completo vai ao player. Cache: 96 MB, 16 arquivos; até 32 MB por faixa. Há proteção da faixa atual/janela próxima e reutilização entre assinaturas renovadas. Primeira reprodução pode esperar a preparação. O arquivo genérico prepareSource.ts mantém URLs no web.

Outras correções: AudioPlaylist.add recebe `{ uri }`; recuperação limitada após erro de faixa pré-carregada; evita repetir URL/formato que falhou, distinguindo clientes YouTube; códigos nativos preservados no diagnóstico. Não restaurar a antiga checagem de apenas um byte.

Teste online separado leu todos os bytes e recebeu HTTP 206 para pedidos semelhantes ao nativo em:
- lQUvn6nFqq0 — Hobby + Gestão Inteligente — 2.878.042 bytes.
- ypQjv_W424E — ESCRAVO MODERNO — 2.549.209 bytes.
- qiasDFc7o5Y — PRÓXIMO CAPÍTULO — 2.130.820 bytes.

Isso não substitui decodificação no aparelho. Guap850 não teve gravação específica confirmada. O usuário informou depois que a reprodução estava funcionando e pediu a identidade final.

## Visual e transições atuais

`assets/branding/` preserva logo, retrato original e sprites. O ícone quadrado foi adaptado por imagegen e inspecionado. Paleta em src/theme.ts, vidro por gradiente/translucidez em GlassCard e capa desfocada no player. Não foi instalada uma biblioteca de blur.

Preferências persistidas em `src/preferences/experience.ts`:
- Som: direta ou fade, 1/2/3/5/8 segundos, curva suave ou linear.
- **Fade não é crossfade:** um único player reduz o volume na saída natural e aumenta na entrada. Pulo manual faz a entrada da nova faixa com fade; não mistura duas faixas.
- Visual: deslizar, dissolver, zoom ou nenhuma. Reduzir movimento continua disponível.
- Vidro/desfoque, personagens e ondas decorativas podem ser desligados.
- PlaybackWaves é animação decorativa de reprodução, **não FFT nem análise do áudio**. Para com pausa/player fechado e respeita reduzir movimento.

Configurações → Sobre contém créditos ZhyrSnow, Liner, termos, privacidade e textos de licença.

## Últimas falhas de build e correções — NÃO REINTRODUZIR

1. **SyntaxError/ELF durante pnpm install no EAS.** O projeto fixava pnpm 12.9.1; o lançador do servidor tentava ler o executável nativo como JS. Corrigido para **pnpm 10.28.2** em package.json e eas.json. `.npmrc`: node-linker=hoisted, manage-package-manager-versions=false, package-manager-strict-version=true. Workspace usa onlyBuiltDependencies para esbuild/unrs-resolver. Lockfile de dependências normalizado sem documento de auto-instalação do pnpm12. Instalação limpa separada com --frozen-lockfile passou. Não usar o pnpm12 global para regravar o lockfile.

2. **Expo Doctor 19/20: expo-font e expo-asset ausentes como dependências diretas.** Corrigido com Expo install: expo-font ~58.0.9 e expo-asset ~58.0.18, ambos diretos e com plugins adicionados pelo Expo ao app.json. Dependências locais foram reinstaladas com pnpm10 para resolver store antiga do pnpm12. Package/lockfile/ZIP estão atualizados. Depois da correção: **Expo Doctor 20/20 passou**; TypeScript, lint e **98 testes passaram**, 3 testes online ignorados por padrão.

`expo install --check` sozinho não detectou os peers ausentes; executar **expo-doctor completo** antes de recomendar outra build.

## Comandos (PowerShell)

```powershell
cd "C:\Users\Administrator\Downloads\TRAAAP\liner-mobile"
npx --yes pnpm@10.28.2 install --frozen-lockfile
npx --yes expo-doctor
npx --yes pnpm@10.28.2 check
```

Prévia no celular, mesmo Wi-Fi; fechar Expo Go e escanear o NOVO QR:

```powershell
npx --yes pnpm@10.28.2 exec expo start --go --lan --port 8084 --max-workers 1 --clear
```

Build APK:

```powershell
npx eas-cli@latest build --platform android --profile preview --clear-cache
```

Perfil preview gera APK, production gera AAB. `.easignore` exclui android/ios para o EAS regenerar nativos a partir da configuração. Não editar Android gerado à mão. Expo prebuild e exportação de bundle Android já passaram; isso **não equivale a APK compilado**. Tentativas locais antigas falharam no CMake do Windows e foram abandonadas em favor do EAS.

## Estado real do APK e pendências

O usuário iniciou builds EAS e informou que uma gerou APK, mas não forneceu artefato/resultados de instalação. Uma build enviada antes da correção de peers mostrou aviso do Doctor e continuou para Gradle. Foi explicado que um APK concluído pode ser testado, mas não contém alterações posteriores ao upload. **Não existe comprovação de build EAS concluída com as duas últimas correções nem teste físico completo.** Não afirmar que o APK final está homologado.

Prioridade para quem continuar: confirmar qual APK está no aparelho, gerar com a source corrigida e testar reprodução das faixas citadas, próxima/anterior, fila automática, fade, pausa/seek, tela bloqueada, notificação e backup/importação. Obter o diagnóstico de Configurações quando houver falha. Conferir ícone/logo/sprites e layout em tela pequena. A ferramenta de navegador da sessão anterior bloqueou a prévia localhost por política, então não houve inspeção visual automatizada da interface final.

Ainda sem paridade integral com o PC: funções sociais, equalizador, crossfade com sobreposição, upload de playlists para nuvem e fluxo WEB_REMIX com tokens. Downloads HLS/DASH não suportados. Provedores externos podem restringir gravações; não prometer catálogo inteiro nem números de RAM/bateria comparados ao Spotify.

## Licença e entrega

O usuário chamou o Liner de open source, mas o LICENSE fornecido na source do PC é **Liner Source-Available & Non-Commercial Contribution License v1.0 (2026)**. Permite uso/modificações pessoais e impõe restrições à redistribuição pública de derivados e comercialização. Foi preservado em src/legal/LINER-LICENSE.txt e no app. Créditos não substituem autorização. O LICENSE MIT da raiz é do template Expo e não altera a licença do Liner ou das artes/personagens. Não publicar ou representar o projeto como autorizado pelos titulares sem evidência.

A árvore contém muitas alterações locais e arquivos novos; não resetar/limpar o repositório para começar. Não há commit/PR final relatado. Continue na pasta atual ou no ZIP mais recente, preservando as correções acima.
