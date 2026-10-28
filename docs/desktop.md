# Hueco Sound para PC

Identidade e direção do projeto: **ZhyrSnow**.

## Abrir a versão atualizada

Feche a versão anterior também pelo ícone da bandeja antes de abrir um novo executável. O aplicativo permite uma instância por vez: se a versão antiga continuar aberta, abrir outro executável pode apenas trazer a janela antiga de volta.

Uma compilação dos fontes (`pnpm build`) não atualiza um executável que já está aberto. Use o pacote gerado com o código atualizado. Não copie somente o arquivo `.exe`: mantenha a pasta completa com os recursos do Electron.

## Documentação, suporte e downloads

- [Projeto Hueco Sound](https://github.com/rvk4prodd/Hueco-Sound-1.0v)
- [Relatar um problema ou pedir ajuda](https://github.com/rvk4prodd/Hueco-Sound-1.0v/issues)
- [Versões publicadas](https://github.com/rvk4prodd/Hueco-Sound-1.0v/releases)

As versões publicadas identificam a plataforma. Este repositório hospeda o aplicativo Android e esta documentação; os fontes do PC são mantidos separadamente no projeto desktop local. Um APK não atualiza o aplicativo de Windows.

## Logs

Abra **Configurações → Logs**. Há filtros por gravidade, busca, captura do estado do player, copiar, salvar JSON e apagar registros com confirmação.

Os últimos 300 registros ficam no computador. URLs, caminhos, emails e padrões de credenciais são ocultados antes de armazenar. O histórico é salvo periodicamente; os instantes imediatamente anteriores a um encerramento forçado podem não ser gravados. Não há envio automático desses logs.

Ao relatar uma falha, informe a versão mostrada no aplicativo, a ação realizada e anexe os logs após revisá-los.

## Compilar os fontes desktop

Na pasta do projeto Electron:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm exec electron-builder --win --x64 --dir --publish never
```

O projeto usa Electron, React, Vite, TypeScript e Zustand. A configuração de distribuição e os recursos necessários ao executável estão em `package.json`.

O atualizador não usa o servidor do projeto de origem por padrão. Atualizações automáticas próprias exigem um servidor e chave do Hueco Sound. A integração Discord também exige um ID próprio; o aplicativo informa quando ainda não está configurado.

## Créditos e licenças

Os créditos e a licença do projeto de origem permanecem na seção de licenças do aplicativo e no arquivo `LICENSE` fornecido com os fontes desktop. Bibliotecas, gravações e artes conservam seus respectivos titulares.
