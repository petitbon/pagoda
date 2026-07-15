class Pagoda < Formula
  desc "Target-agnostic validation framework for agentic software"
  homepage "https://github.com/petitbon/pagoda"
  url "https://github.com/petitbon/pagoda/releases/download/v0.4.0/pagoda-cli-standalone.tgz"
  version "0.4.0"
  sha256 "eedc54269edfb1f7a0722f9b491a6d4d9ef7ab24d99ed1d31a4b71e405598a18"
  license "Apache-2.0"

  depends_on "node"

  def install
    package_root = buildpath/"package"
    source_root = package_root.directory? ? package_root : buildpath

    libexec.install source_root.children

    (bin/"pagoda").write <<~SH
      #!/usr/bin/env bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/index.js" "$@"
    SH
  end

  test do
    assert_match(/\A\d+\.\d+\.\d+/, shell_output("#{bin}/pagoda --version"))
  end
end
