all:
	@echo "Tasks:"
	@echo "  .cache/caddy"
	@echo "  test"
	@echo "  clean"

.cache/caddy:
	mkdir .cache
	wget --user-agent="Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0" -O .cache/caddy 'https://caddyserver.com/api/download?os=linux&arch=amd64&idempotency=63456428387222'
	chmod +x .cache/caddy

test: .cache/caddy
	.cache/caddy run --config Caddyfile.local

clean:
	rm -rf .cache/
