class Pagoda < Formula
  desc "Target-agnostic validation framework for agentic software"
  homepage "https://github.com/petitbon/pagoda"
  url "https://github.com/petitbon/pagoda/releases/download/v0.2.0/pagoda-cli-standalone.tgz"
  version "0.2.0"
  sha256 "289109ccc61f3711f0b7ba40341c9c626659c7f0b6f308badab2e1c6f88ae53d"
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
