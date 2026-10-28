# Hueco Sound 1.2.0

Aplicativo React Native / Expo SDK 58 para Android. Identidade do projeto: ZhyrSnow. Adaptação pessoal baseada no Liner; consulte a licença original em `src/legal/notices.ts (originalProjectLicense)` e os créditos dentro do aplicativo.

## Instalação e build reproduzíveis

Use `npx --yes pnpm@10.28.2 install --frozen-lockfile`. O projeto e os perfis EAS fixam pnpm 10.28.2. Não use pnpm 12 para regenerar o lockfile: o servidor EAS pode tentar iniciá-lo como JavaScript e falhar com SyntaxError/ELF. A configuração impede troca automática de gerenciador e recusa versões diferentes.

`expo-font` e `expo-asset` são dependências nativas diretas, exigidas respectivamente pelos ícones e pelo áudio. Antes de enviar a build execute `npx expo-doctor`; a verificação `expo install --check` sozinha não valida todos os peers nativos.

Para reenviar uma build após corrigir a instalação: `npx eas-cli@latest build --platform android --profile preview --clear-cache`. A conta Expo e a assinatura Android já vinculadas continuam as mesmas.

## Identidade e transições

Logo e sprites fornecidos pelo usuário, rosto do personagem no ícone e paleta turquesa sobre fundo escuro. Configurações → Transições permite troca direta ou fade de 1, 2, 3, 5 ou 8 segundos, com curva linear ou suave. O fade usa um único player: reduz o volume ao final da faixa e aumenta na entrada da seguinte; não é crossfade com sobreposição. No pulo manual, a nova faixa entra com o fade selecionado.

As animações de capas e telas oferecem deslizar, dissolver, zoom ou nenhuma. A opção reduzir movimento continua disponível. Vidro/desfoque, ondas decorativas e personagens podem ser desativados separadamente. As ondas indicam reprodução, sem medir o espectro do áudio; param quando a música pausa ou o player fica fechado. Termos, privacidade, créditos a ZhyrSnow/Liner e texto integral das licenças estão em Configurações → Sobre, créditos e termos.

## Testar pelo QR

Na pasta do projeto: `pnpm exec expo start --go --lan --port 8084 --max-workers 1 --clear`.
Feche completamente o Expo Go e leia o novo QR Code, no mesmo Wi-Fi. A porta nova evita abrir uma sessão anterior do Metro. Essa prévia não valida o serviço de mídia próprio do APK. Os controles de notificação e a reprodução prolongada com a tela bloqueada precisam ser testados na build Android instalada.

## Recursos implementados

Busca de músicas; curtidas e histórico; criar, renomear e excluir playlists; adicionar faixas diretamente pela busca; reordenar playlists/fila; player completo com seek, próximo/anterior, repetição e aleatório; letras sincronizadas quando disponíveis e ajuste de tempo; temporizador; velocidade e volume; importação de arquivos do aparelho; backup JSON de metadados; downloads de áudio progressivo; entrada de conta, importação da biblioteca online e envio explícito de curtidas.

As transições do player usam animações nativas e respeitam a opção de reduzir movimentos. Há diagnóstico de reprodução nas configurações.

## Origem do áudio e correção de Source error

A busca usa YouTube Music (Innertube). O áudio vem do cache autenticado do Liner quando disponível; depois, dos perfis de reprodução do YouTube presentes no desktop, priorizando VISIONOS e usando ANDROID_VR como alternativa. Não há reprodução de áudio pela API do Spotify. SoundCloud é uma alternativa apenas quando título, artista e duração identificam a gravação.

O teste antigo de um byte aceitava fontes que depois respondiam HTTP 403. A seleção agora verifica o fim do arquivo quando o tamanho está disponível. No Android/iOS, fontes Googlevideo com tamanho conhecido são preparadas em cache por trechos de até 256 KB, com validação do tamanho de cada trecho, cancelamento e nova tentativa em outra fonte. Só arquivos completos chegam ao player; a primeira reprodução pode aguardar essa preparação. Cache temporário limitado a 96 MB e 16 arquivos, com até 32 MB por faixa. Não equivale a salvar a música na biblioteca offline. As próximas duas faixas podem ser preparadas antecipadamente.

O desktop também possui um fluxo WEB_REMIX com youtubei.js e tokens gerados numa janela Electron. Esse fluxo específico não foi portado para o celular; gravações que exigem autenticação ou verificações adicionais ainda podem falhar.

## Validação

`pnpm check` executa TypeScript, lint e testes. Os testes automatizados não substituem a validação no Android físico. Não existem números medidos de RAM, bateria ou desempenho comparado ao Spotify.

Teste online opcional de transferência completa: definir LINER_PROVIDER_DIAG=1 e executar `pnpm exec vitest run tests/provider-analysis.live.test.ts`. Ele verifica três IDs fixos de gravações informadas, pedidos HTTP semelhantes aos do player e todos os bytes do áudio; não imprime URLs assinadas. Não substitui a decodificação no aparelho.

## Limitações atuais

Serviços externos podem restringir determinadas gravações. O player tenta outra URL/formato da mesma gravação quando a primeira falha; não é garantia de disponibilidade de todo o catálogo. Downloads HLS/DASH não são suportados. As playlists locais ainda não são enviadas à nuvem; importação online e envio de curtidas são operações explícitas. Funções sociais, equalizador e crossfade da versão desktop não foram portadas.

## APK

`pnpm build:apk` usa EAS Build e requer autenticação Expo. `eas.json` contém o perfil preview para APK. Nome Android: Hueco Sound. Pacote: com.zhyrsnow.huecosound. Esquema de links: huecosound. A identidade nova instala como outro aplicativo: exporte sua biblioteca antes para importá-la depois.

`npx eas-cli@latest login` faz login na sua conta Expo; depois execute `pnpm build:apk`. Vincule/crie o projeto Hueco Sound quando o EAS solicitar e gere as credenciais Android quando necessário. Guarde a assinatura para futuras atualizações. `.easignore` exclui os projetos nativos gerados, para o EAS regenerá-los com o nome, ícone e serviço de áudio atuais. Essa operação gera APK pessoal; não publica em loja. O projeto ainda exige teste em Android físico.

O arquivo de licença original do Liner é source-available e contém restrições à distribuição pública de derivados. Créditos não substituem autorização. O MIT do template Expo permanece preservado separadamente; não se aplica automaticamente à source original do Liner ou às artes.

## Arquivos visuais

`assets/branding/hueco-logo.png`, `hueco-face-original.png` e `hueco-sprites.png` preservam os originais enviados. `hueco-icon.png` foi preparado com a ferramenta integrada imagegen. Prompt: adaptar o retrato para um ícone Android quadrado, preservando rosto, chapéu, óculos, traço e cores, sem texto ou bordas. Os personagens são recortados apenas na apresentação do app, sem duplicar a folha de sprites.

## Logs locais

Abra Configurações → Logs do aplicativo para acompanhar erros, filtrar registros, buscar, compartilhar e limpar o histórico. Os últimos 300 registros são guardados no aparelho; URLs, emails, caminhos e credenciais são ocultados antes de armazenar. O histórico de logs não é enviado automaticamente. O arquivo compartilhado identifica a versão do aplicativo.
